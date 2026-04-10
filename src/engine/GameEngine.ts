// ============================================================
// MONOPOLY DEAL ONLINE — Game Engine
// ============================================================
// Pure game logic. No I/O, no networking, no side effects.
// Takes a GameState + PlayerAction, returns a new GameState
// or an error string. This is the single source of truth.
// ============================================================

import {
  GameState,
  PlayerState,
  PlayerAction,
  ActionType,
  TurnPhase,
  CardType,
  PropertyColor,
  PendingAction,
  PendingActionType,
  Card,
  PropertyGroup,
} from "../shared/types";
import { buildDeck } from "../shared/cardData";
import {
  CARDS_TO_DRAW,
  CARDS_TO_DRAW_EMPTY_HAND,
  MAX_PLAYS_PER_TURN,
  MAX_HAND_SIZE,
  DEBT_COLLECTOR_AMOUNT,
  BIRTHDAY_AMOUNT,
  DOUBLE_DECK_THRESHOLD,
  SET_SIZE,
} from "../shared/constants";
import {
  shuffle,
  getCurrentPlayer,
  getPlayer,
  findCardInHand,
  removeCardFromHand,
  removeCardFromProperties,
  removeCardFromBank,
  getOrCreatePropertyGroup,
  isSetComplete,
  countCompleteSets,
  hasWon,
  calculateRent,
  canCardGoToColor,
  drawCards,
  canPayAnything,
  findCardInProperties,
  isActionCard,
} from "./helpers";

// ---- Result Type ----

export type EngineResult =
  | { ok: true; state: GameState; description: string }
  | { ok: false; error: string };

// ---- Initialize a New Game ----

export function initializeGame(
  roomCode: string,
  players: { id: string; name: string; avatar: number }[]
): GameState {
  const useDoubleDeck = players.length >= DOUBLE_DECK_THRESHOLD;
  const deck = shuffle(buildDeck(useDoubleDeck));

  // Deal 5 cards to each player
  const playerStates: PlayerState[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    hand: [],
    bank: [],
    properties: [],
    connected: true,
  }));

  // Deal from the deck
  for (let i = 0; i < 5; i++) {
    for (const player of playerStates) {
      const card = deck.pop();
      if (card) player.hand.push(card);
    }
  }

  const state: GameState = {
    roomCode,
    deck,
    discardPile: [],
    players: playerStates,
    currentPlayerIndex: 0,
    actionsRemaining: MAX_PLAYS_PER_TURN,
    phase: TurnPhase.Draw,
    pendingAction: null,
    turnNumber: 1,
    winnerId: null,
    useDoubleDeck,
    doubleRentActive: false,
  };

  // Auto-draw for the first player
  return performDraw(state);
}

// ---- Draw Phase ----

function performDraw(state: GameState): GameState {
  const player = getCurrentPlayer(state);
  const count =
    player.hand.length === 0 ? CARDS_TO_DRAW_EMPTY_HAND : CARDS_TO_DRAW;
  const drawn = drawCards(state, count);
  player.hand.push(...drawn);
  state.phase = TurnPhase.Play;
  state.actionsRemaining = MAX_PLAYS_PER_TURN;
  return state;
}

// ---- Main Action Processor ----

export function applyAction(
  state: GameState,
  action: PlayerAction
): EngineResult {
  // Deep clone state so we don't mutate the original
  state = JSON.parse(JSON.stringify(state));

  const player = getPlayer(state, action.playerId);
  if (!player) return { ok: false, error: "Player not found" };

  // Handle response actions (can happen during AwaitingResponse phase)
  if (state.phase === TurnPhase.AwaitingResponse) {
    return handleResponseAction(state, action, player);
  }

  // Normal turn actions — must be the current player
  const currentPlayer = getCurrentPlayer(state);
  if (player.id !== currentPlayer.id) {
    return { ok: false, error: "Not your turn" };
  }

  if (state.phase === TurnPhase.Discard) {
    return handleDiscard(state, action, player);
  }

  if (state.phase !== TurnPhase.Play) {
    return { ok: false, error: `Cannot play during phase: ${state.phase}` };
  }

  switch (action.type) {
    case ActionType.PlayPropertyCard:
      return playPropertyCard(state, action, player);
    case ActionType.PlayMoneyToBank:
      return playMoneyToBank(state, action, player);
    case ActionType.PlayActionToBank:
      return playActionToBank(state, action, player);
    case ActionType.PlayPassGo:
      return playPassGo(state, action, player);
    case ActionType.PlayRentCard:
      return playRentCard(state, action, player);
    case ActionType.PlayDebtCollector:
      return playDebtCollector(state, action, player);
    case ActionType.PlayBirthday:
      return playBirthday(state, action, player);
    case ActionType.PlaySlyDeal:
      return playSlyDeal(state, action, player);
    case ActionType.PlayForcedDeal:
      return playForcedDeal(state, action, player);
    case ActionType.PlayDealBreaker:
      return playDealBreaker(state, action, player);
    case ActionType.PlayHouse:
      return playHouse(state, action, player);
    case ActionType.PlayHotel:
      return playHotel(state, action, player);
    case ActionType.PlayDoubleRent:
      return playDoubleRent(state, action, player);
    case ActionType.MoveWildCard:
      return moveWildCard(state, action, player);
    case ActionType.EndTurn:
      return endTurn(state, player);
    default:
      return { ok: false, error: `Unknown action: ${action.type}` };
  }
}

// ---- Helper: consume a play ----

function consumePlay(state: GameState): void {
  state.actionsRemaining--;
}

function checkAutoEndTurn(state: GameState): GameState {
  const player = getCurrentPlayer(state);
  if (state.actionsRemaining <= 0 && state.phase === TurnPhase.Play) {
    if (player.hand.length > MAX_HAND_SIZE) {
      state.phase = TurnPhase.Discard;
    } else {
      advanceTurn(state);
    }
  }
  return state;
}

function advanceTurn(state: GameState): void {
  // Check for win
  const currentPlayer = getCurrentPlayer(state);
  if (hasWon(currentPlayer)) {
    state.winnerId = currentPlayer.id;
    state.phase = TurnPhase.GameOver;
    return;
  }

  state.currentPlayerIndex =
    (state.currentPlayerIndex + 1) % state.players.length;
  state.turnNumber++;
  state.phase = TurnPhase.Draw;

  // Auto-draw for next player
  performDraw(state);
}

// ---- Play Actions ----

function playPropertyCard(
  state: GameState,
  action: PlayerAction,
  player: PlayerState
): EngineResult {
  if (!action.cardId) return { ok: false, error: "No card specified" };

  const card = findCardInHand(player, action.cardId);
  if (!card) return { ok: false, error: "Card not in hand" };

  // Determine destination color
  let destColor: PropertyColor;

  if (card.type === CardType.Property) {
    destColor = action.destinationColor || card.color!;
    if (destColor !== card.color) {
      return { ok: false, error: "Property card must go to its own color" };
    }
  } else if (
    card.type === CardType.PropertyWild ||
    card.type === CardType.PropertyWildAll
  ) {
    if (!action.destinationColor) {
      return { ok: false, error: "Must specify destination color for wild card" };
    }
    destColor = action.destinationColor;
    if (!canCardGoToColor(card, destColor)) {
      return { ok: false, error: "Wild card cannot be placed on that color" };
    }
  } else {
    return { ok: false, error: "Card is not a property card" };
  }

  removeCardFromHand(player, action.cardId);
  const group = getOrCreatePropertyGroup(player, destColor);
  group.cards.push(card);

  consumePlay(state);

  const desc = `${player.name} played ${card.name} to ${destColor}`;
  checkAutoEndTurn(state);

  // Check for immediate win
  if (hasWon(player)) {
    state.winnerId = player.id;
    state.phase = TurnPhase.GameOver;
  }

  return { ok: true, state, description: desc };
}

function playMoneyToBank(
  state: GameState,
  action: PlayerAction,
  player: PlayerState
): EngineResult {
  if (!action.cardId) return { ok: false, error: "No card specified" };

  const card = findCardInHand(player, action.cardId);
  if (!card) return { ok: false, error: "Card not in hand" };
  if (card.type !== CardType.Money) {
    return { ok: false, error: "Card is not a money card" };
  }

  removeCardFromHand(player, action.cardId);
  player.bank.push(card);
  consumePlay(state);

  const desc = `${player.name} banked $${card.bankValue}M`;
  checkAutoEndTurn(state);

  return { ok: true, state, description: desc };
}

function playActionToBank(
  state: GameState,
  action: PlayerAction,
  player: PlayerState
): EngineResult {
  if (!action.cardId) return { ok: false, error: "No card specified" };

  const card = findCardInHand(player, action.cardId);
  if (!card) return { ok: false, error: "Card not in hand" };
  if (!isActionCard(card) && card.type !== CardType.RentTwoColor && card.type !== CardType.RentWild) {
    return { ok: false, error: "Card cannot be banked as money" };
  }

  removeCardFromHand(player, action.cardId);
  player.bank.push(card);
  consumePlay(state);

  const desc = `${player.name} banked ${card.name} as $${card.bankValue}M`;
  checkAutoEndTurn(state);

  return { ok: true, state, description: desc };
}

function playPassGo(
  state: GameState,
  action: PlayerAction,
  player: PlayerState
): EngineResult {
  if (!action.cardId) return { ok: false, error: "No card specified" };

  const card = findCardInHand(player, action.cardId);
  if (!card) return { ok: false, error: "Card not in hand" };
  if (card.type !== CardType.ActionPassGo) {
    return { ok: false, error: "Card is not Pass Go" };
  }

  removeCardFromHand(player, action.cardId);
  state.discardPile.push(card);

  // Draw 2 cards
  const drawn = drawCards(state, 2);
  player.hand.push(...drawn);

  consumePlay(state);

  const desc = `${player.name} played Pass Go and drew 2 cards`;
  checkAutoEndTurn(state);

  return { ok: true, state, description: desc };
}

function playRentCard(
  state: GameState,
  action: PlayerAction,
  player: PlayerState
): EngineResult {
  if (!action.cardId) return { ok: false, error: "No card specified" };
  if (!action.targetColor) return { ok: false, error: "No target color specified" };

  const card = findCardInHand(player, action.cardId);
  if (!card) return { ok: false, error: "Card not in hand" };

  // Validate this rent card can target the chosen color
  if (card.type === CardType.RentTwoColor) {
    if (
      !card.rentColors ||
      !card.rentColors.includes(action.targetColor)
    ) {
      return { ok: false, error: "Rent card does not match that color" };
    }
  } else if (card.type !== CardType.RentWild) {
    return { ok: false, error: "Card is not a rent card" };
  }

  // Must have properties of that color
  const group = player.properties.find((g) => g.color === action.targetColor);
  if (!group || group.cards.length === 0) {
    return { ok: false, error: "You have no properties of that color" };
  }

  const doubled = state.doubleRentActive;
  const rentAmount = calculateRent(group, doubled);
  if (rentAmount === 0) {
    return { ok: false, error: "Rent would be $0" };
  }

  removeCardFromHand(player, action.cardId);
  state.discardPile.push(card);
  consumePlay(state);
  state.doubleRentActive = false;

  // Determine targets: 2-color rent = ALL players, wild rent = ONE player
  let targetIds: string[];
  if (card.type === CardType.RentTwoColor) {
    targetIds = state.players.filter((p) => p.id !== player.id).map((p) => p.id);
  } else {
    // Wild rent targets one player
    if (!action.targetPlayerId) {
      return { ok: false, error: "Wild rent must target a specific player" };
    }
    targetIds = [action.targetPlayerId];
  }

  state.pendingAction = {
    type: PendingActionType.PayRent,
    fromPlayerId: player.id,
    targetPlayerIds: targetIds,
    respondedPlayerIds: [],
    amount: rentAmount,
    cardId: action.cardId,
    isDoubled: doubled,
  };
  state.phase = TurnPhase.AwaitingResponse;

  const desc = `${player.name} charges $${rentAmount}M rent for ${action.targetColor}`;
  return { ok: true, state, description: desc };
}

function playDebtCollector(
  state: GameState,
  action: PlayerAction,
  player: PlayerState
): EngineResult {
  if (!action.cardId) return { ok: false, error: "No card specified" };
  if (!action.targetPlayerId) return { ok: false, error: "No target player" };

  const card = findCardInHand(player, action.cardId);
  if (!card || card.type !== CardType.ActionDebtCollector) {
    return { ok: false, error: "Card is not Debt Collector" };
  }

  const target = getPlayer(state, action.targetPlayerId);
  if (!target || target.id === player.id) {
    return { ok: false, error: "Invalid target player" };
  }

  removeCardFromHand(player, action.cardId);
  state.discardPile.push(card);
  consumePlay(state);

  state.pendingAction = {
    type: PendingActionType.PayDebtCollector,
    fromPlayerId: player.id,
    targetPlayerIds: [target.id],
    respondedPlayerIds: [],
    amount: DEBT_COLLECTOR_AMOUNT,
    cardId: action.cardId,
  };
  state.phase = TurnPhase.AwaitingResponse;

  const desc = `${player.name} played Debt Collector on ${target.name} ($${DEBT_COLLECTOR_AMOUNT}M)`;
  return { ok: true, state, description: desc };
}

function playBirthday(
  state: GameState,
  action: PlayerAction,
  player: PlayerState
): EngineResult {
  if (!action.cardId) return { ok: false, error: "No card specified" };

  const card = findCardInHand(player, action.cardId);
  if (!card || card.type !== CardType.ActionItsMyBirthday) {
    return { ok: false, error: "Card is not It's My Birthday" };
  }

  removeCardFromHand(player, action.cardId);
  state.discardPile.push(card);
  consumePlay(state);

  const targetIds = state.players
    .filter((p) => p.id !== player.id)
    .map((p) => p.id);

  state.pendingAction = {
    type: PendingActionType.PayBirthday,
    fromPlayerId: player.id,
    targetPlayerIds: targetIds,
    respondedPlayerIds: [],
    amount: BIRTHDAY_AMOUNT,
    cardId: action.cardId,
  };
  state.phase = TurnPhase.AwaitingResponse;

  const desc = `${player.name} played It's My Birthday! Everyone owes $${BIRTHDAY_AMOUNT}M`;
  return { ok: true, state, description: desc };
}

function playSlyDeal(
  state: GameState,
  action: PlayerAction,
  player: PlayerState
): EngineResult {
  if (!action.cardId) return { ok: false, error: "No card specified" };
  if (!action.targetPlayerId) return { ok: false, error: "No target player" };
  if (!action.targetCardId) return { ok: false, error: "No target card" };

  const card = findCardInHand(player, action.cardId);
  if (!card || card.type !== CardType.ActionSlyDeal) {
    return { ok: false, error: "Card is not Sly Deal" };
  }

  const target = getPlayer(state, action.targetPlayerId);
  if (!target || target.id === player.id) {
    return { ok: false, error: "Invalid target player" };
  }

  // Can't steal from a complete set
  const targetCard = findCardInProperties(target, action.targetCardId);
  if (!targetCard) return { ok: false, error: "Target card not found" };
  if (isSetComplete(targetCard.group)) {
    return { ok: false, error: "Cannot steal from a complete set" };
  }

  removeCardFromHand(player, action.cardId);
  state.discardPile.push(card);
  consumePlay(state);

  state.pendingAction = {
    type: PendingActionType.RespondToSlyDeal,
    fromPlayerId: player.id,
    targetPlayerIds: [target.id],
    respondedPlayerIds: [],
    targetCardId: action.targetCardId,
    cardId: action.cardId,
  };
  state.phase = TurnPhase.AwaitingResponse;

  const desc = `${player.name} played Sly Deal on ${target.name}'s ${targetCard.card.name}`;
  return { ok: true, state, description: desc };
}

function playForcedDeal(
  state: GameState,
  action: PlayerAction,
  player: PlayerState
): EngineResult {
  if (!action.cardId) return { ok: false, error: "No card specified" };
  if (!action.targetPlayerId) return { ok: false, error: "No target player" };
  if (!action.offeredCardId) return { ok: false, error: "No offered card" };
  if (!action.requestedCardId) return { ok: false, error: "No requested card" };

  const card = findCardInHand(player, action.cardId);
  if (!card || card.type !== CardType.ActionForcedDeal) {
    return { ok: false, error: "Card is not Forced Deal" };
  }

  const target = getPlayer(state, action.targetPlayerId);
  if (!target || target.id === player.id) {
    return { ok: false, error: "Invalid target player" };
  }

  // Offered card must be yours (in properties) and NOT in a complete set
  const offered = findCardInProperties(player, action.offeredCardId);
  if (!offered) return { ok: false, error: "Offered card not in your properties" };
  if (isSetComplete(offered.group)) {
    return { ok: false, error: "Cannot trade from your own complete set" };
  }

  // Requested card must be theirs and NOT in a complete set
  const requested = findCardInProperties(target, action.requestedCardId);
  if (!requested) return { ok: false, error: "Requested card not in target's properties" };
  if (isSetComplete(requested.group)) {
    return { ok: false, error: "Cannot steal from a complete set" };
  }

  removeCardFromHand(player, action.cardId);
  state.discardPile.push(card);
  consumePlay(state);

  state.pendingAction = {
    type: PendingActionType.RespondToForcedDeal,
    fromPlayerId: player.id,
    targetPlayerIds: [target.id],
    respondedPlayerIds: [],
    offeredCardId: action.offeredCardId,
    requestedCardId: action.requestedCardId,
    cardId: action.cardId,
  };
  state.phase = TurnPhase.AwaitingResponse;

  const desc = `${player.name} played Forced Deal: swap ${offered.card.name} for ${target.name}'s ${requested.card.name}`;
  return { ok: true, state, description: desc };
}

function playDealBreaker(
  state: GameState,
  action: PlayerAction,
  player: PlayerState
): EngineResult {
  if (!action.cardId) return { ok: false, error: "No card specified" };
  if (!action.targetPlayerId) return { ok: false, error: "No target player" };
  if (!action.targetColor) return { ok: false, error: "No target color" };

  const card = findCardInHand(player, action.cardId);
  if (!card || card.type !== CardType.ActionDealBreaker) {
    return { ok: false, error: "Card is not Deal Breaker" };
  }

  const target = getPlayer(state, action.targetPlayerId);
  if (!target || target.id === player.id) {
    return { ok: false, error: "Invalid target player" };
  }

  // Target must have a COMPLETE set of this color
  const targetGroup = target.properties.find(
    (g) => g.color === action.targetColor
  );
  if (!targetGroup || !isSetComplete(targetGroup)) {
    return { ok: false, error: "Target does not have a complete set of that color" };
  }

  removeCardFromHand(player, action.cardId);
  state.discardPile.push(card);
  consumePlay(state);

  state.pendingAction = {
    type: PendingActionType.RespondToDealBreaker,
    fromPlayerId: player.id,
    targetPlayerIds: [target.id],
    respondedPlayerIds: [],
    targetCardId: action.targetColor, // reusing field for the color
    cardId: action.cardId,
  };
  state.phase = TurnPhase.AwaitingResponse;

  const desc = `${player.name} played Deal Breaker on ${target.name}'s ${action.targetColor} set!`;
  return { ok: true, state, description: desc };
}

function playHouse(
  state: GameState,
  action: PlayerAction,
  player: PlayerState
): EngineResult {
  if (!action.cardId) return { ok: false, error: "No card specified" };
  if (!action.targetColor) return { ok: false, error: "No target color" };

  const card = findCardInHand(player, action.cardId);
  if (!card || card.type !== CardType.ActionHouse) {
    return { ok: false, error: "Card is not a House" };
  }

  // Can't add house to railroad or utility
  if (
    action.targetColor === PropertyColor.Railroad ||
    action.targetColor === PropertyColor.Utility
  ) {
    return { ok: false, error: "Cannot place house on railroad or utility" };
  }

  const group = player.properties.find((g) => g.color === action.targetColor);
  if (!group || !isSetComplete(group)) {
    return { ok: false, error: "Can only place house on a complete set" };
  }
  if (group.hasHouse) {
    return { ok: false, error: "Set already has a house" };
  }

  removeCardFromHand(player, action.cardId);
  group.hasHouse = true;
  consumePlay(state);

  const desc = `${player.name} placed a House on ${action.targetColor}`;
  checkAutoEndTurn(state);

  return { ok: true, state, description: desc };
}

function playHotel(
  state: GameState,
  action: PlayerAction,
  player: PlayerState
): EngineResult {
  if (!action.cardId) return { ok: false, error: "No card specified" };
  if (!action.targetColor) return { ok: false, error: "No target color" };

  const card = findCardInHand(player, action.cardId);
  if (!card || card.type !== CardType.ActionHotel) {
    return { ok: false, error: "Card is not a Hotel" };
  }

  if (
    action.targetColor === PropertyColor.Railroad ||
    action.targetColor === PropertyColor.Utility
  ) {
    return { ok: false, error: "Cannot place hotel on railroad or utility" };
  }

  const group = player.properties.find((g) => g.color === action.targetColor);
  if (!group || !isSetComplete(group)) {
    return { ok: false, error: "Can only place hotel on a complete set" };
  }
  if (!group.hasHouse) {
    return { ok: false, error: "Must have a house before placing a hotel" };
  }
  if (group.hasHotel) {
    return { ok: false, error: "Set already has a hotel" };
  }

  removeCardFromHand(player, action.cardId);
  group.hasHotel = true;
  consumePlay(state);

  const desc = `${player.name} placed a Hotel on ${action.targetColor}`;
  checkAutoEndTurn(state);

  return { ok: true, state, description: desc };
}

function playDoubleRent(
  state: GameState,
  action: PlayerAction,
  player: PlayerState
): EngineResult {
  // Double Rent must be played WITH a rent card in the same turn
  // It costs 1 of your 3 plays, and the rent card costs another
  // For simplicity, we allow it to be played before the rent card,
  // flagging a "doubleRentActive" state.
  // The next rent played this turn will be doubled.
  if (!action.cardId) return { ok: false, error: "No card specified" };

  const card = findCardInHand(player, action.cardId);
  if (!card || card.type !== CardType.ActionDoubleRent) {
    return { ok: false, error: "Card is not Double the Rent" };
  }

  if (state.actionsRemaining < 2) {
    return {
      ok: false,
      error: "Need at least 2 actions remaining (1 for Double Rent + 1 for Rent)",
    };
  }

  removeCardFromHand(player, action.cardId);
  state.discardPile.push(card);
  consumePlay(state);

  state.doubleRentActive = true;

  const desc = `${player.name} played Double the Rent! Next rent is doubled`;
  return { ok: true, state, description: desc };
}

function moveWildCard(
  state: GameState,
  action: PlayerAction,
  player: PlayerState
): EngineResult {
  if (!action.cardId) return { ok: false, error: "No card specified" };
  if (!action.destinationColor) return { ok: false, error: "No destination color" };

  const found = findCardInProperties(player, action.cardId);
  if (!found) return { ok: false, error: "Card not in your properties" };

  const { card, group } = found;
  if (
    card.type !== CardType.PropertyWild &&
    card.type !== CardType.PropertyWildAll
  ) {
    return { ok: false, error: "Only wild cards can be moved between colors" };
  }
  if (isSetComplete(group)) {
    return { ok: false, error: "Cannot move a card from a complete set" };
  }
  if (!canCardGoToColor(card, action.destinationColor)) {
    return { ok: false, error: "Wild card cannot go to that color" };
  }

  // Remove from current group
  removeCardFromProperties(player, action.cardId);

  // Add to destination
  const destGroup = getOrCreatePropertyGroup(player, action.destinationColor);
  destGroup.cards.push(card);

  // Moving wilds does NOT consume a play (debated, but most common ruling)
  const desc = `${player.name} moved ${card.name} to ${action.destinationColor}`;

  return { ok: true, state, description: desc };
}

// ---- End Turn / Discard ----

function endTurn(state: GameState, player: PlayerState): EngineResult {
  if (player.hand.length > MAX_HAND_SIZE) {
    state.phase = TurnPhase.Discard;
    const desc = `${player.name} must discard to ${MAX_HAND_SIZE} cards`;
    return { ok: true, state, description: desc };
  }

  advanceTurn(state);
  const desc = `${player.name} ended their turn`;
  return { ok: true, state, description: desc };
}

function handleDiscard(
  state: GameState,
  action: PlayerAction,
  player: PlayerState
): EngineResult {
  if (action.type !== ActionType.DiscardCards) {
    return { ok: false, error: "Must discard cards" };
  }
  if (!action.cardIds || action.cardIds.length === 0) {
    return { ok: false, error: "No cards to discard" };
  }

  const excess = player.hand.length - MAX_HAND_SIZE;
  if (action.cardIds.length !== excess) {
    return {
      ok: false,
      error: `Must discard exactly ${excess} card(s), got ${action.cardIds.length}`,
    };
  }

  for (const cardId of action.cardIds) {
    const card = removeCardFromHand(player, cardId);
    if (!card) return { ok: false, error: `Card ${cardId} not in hand` };
    state.discardPile.push(card);
  }

  advanceTurn(state);
  const desc = `${player.name} discarded ${action.cardIds.length} card(s)`;
  return { ok: true, state, description: desc };
}

// ---- Response Actions (AwaitingResponse phase) ----

function handleResponseAction(
  state: GameState,
  action: PlayerAction,
  player: PlayerState
): EngineResult {
  const pending = state.pendingAction;
  if (!pending) return { ok: false, error: "No pending action" };

  if (!pending.targetPlayerIds.includes(player.id)) {
    return { ok: false, error: "You are not a target of this action" };
  }
  if (pending.respondedPlayerIds.includes(player.id)) {
    return { ok: false, error: "You have already responded" };
  }

  switch (action.type) {
    case ActionType.PlayJustSayNo:
      return handleJustSayNo(state, action, player);
    case ActionType.PayWithCards:
      return handlePayment(state, action, player);
    case ActionType.AcceptAction:
      return handleAcceptAction(state, action, player);
    default:
      return { ok: false, error: "Invalid response action" };
  }
}

function handleJustSayNo(
  state: GameState,
  action: PlayerAction,
  player: PlayerState
): EngineResult {
  if (!action.cardId) return { ok: false, error: "No card specified" };

  const card = findCardInHand(player, action.cardId);
  if (!card || card.type !== CardType.ActionJustSayNo) {
    return { ok: false, error: "Card is not Just Say No" };
  }

  removeCardFromHand(player, action.cardId);
  state.discardPile.push(card);

  const pending = state.pendingAction!;

  // Just Say No can be countered by another Just Say No
  // Switch the pending action to ask the original player to counter
  state.pendingAction = {
    type: PendingActionType.CounterJustSayNo,
    fromPlayerId: player.id, // the JSN player is now "attacking"
    targetPlayerIds: [pending.fromPlayerId], // original attacker must decide
    respondedPlayerIds: [],
    justSayNoChain: [
      ...(pending.justSayNoChain || []),
      { playerId: player.id, action: "just_say_no" },
    ],
    // Preserve the original action details
    amount: pending.amount,
    cardId: pending.cardId,
    targetCardId: pending.targetCardId,
    offeredCardId: pending.offeredCardId,
    requestedCardId: pending.requestedCardId,
  };

  const desc = `${player.name} played Just Say No!`;
  return { ok: true, state, description: desc };
}

function handlePayment(
  state: GameState,
  action: PlayerAction,
  player: PlayerState
): EngineResult {
  const pending = state.pendingAction!;
  if (!action.cardIds) return { ok: false, error: "No cards to pay with" };

  const amountOwed = pending.amount || 0;
  const fromPlayer = getPlayer(state, pending.fromPlayerId)!;

  // Collect payment cards (from bank and/or properties)
  let totalPaid = 0;
  const paidCards: Card[] = [];

  for (const cardId of action.cardIds) {
    let card = removeCardFromBank(player, cardId);
    if (!card) {
      card = removeCardFromProperties(player, cardId);
    }
    if (!card) return { ok: false, error: `Card ${cardId} not found in bank or properties` };
    totalPaid += card.bankValue;
    paidCards.push(card);
  }

  // No change given — overpayment is just lost
  // But player must pay at least the amount (or everything they have)
  if (totalPaid < amountOwed && canPayAnything(player)) {
    // Put cards back (this is a simplified rollback)
    // In practice, the client should validate before sending
    return { ok: false, error: `Payment of $${totalPaid}M is less than $${amountOwed}M owed` };
  }

  // Transfer cards to the collecting player
  for (const card of paidCards) {
    if (
      card.type === CardType.Property ||
      card.type === CardType.PropertyWild
    ) {
      // Property cards go to the collector's property area
      // 2-color wilds go to their primary color
      const color = card.color!;
      const group = getOrCreatePropertyGroup(fromPlayer, color);
      group.cards.push(card);
    } else if (card.type === CardType.PropertyWildAll) {
      // Rainbow wilds have no correct color — go to bank
      fromPlayer.bank.push(card);
    } else {
      // Money and action cards go to the collector's bank
      fromPlayer.bank.push(card);
    }
  }

  pending.respondedPlayerIds.push(player.id);

  const desc = `${player.name} paid $${totalPaid}M`;

  // Check if all targets have responded
  if (
    pending.respondedPlayerIds.length >= pending.targetPlayerIds.length
  ) {
    state.pendingAction = null;
    state.phase = TurnPhase.Play;
    checkAutoEndTurn(state);
  }

  return { ok: true, state, description: desc };
}

function handleAcceptAction(
  state: GameState,
  action: PlayerAction,
  player: PlayerState
): EngineResult {
  const pending = state.pendingAction!;
  const fromPlayer = getPlayer(state, pending.fromPlayerId)!;

  // Handle counter Just Say No — accepting means the JSN wins
  if (pending.type === PendingActionType.CounterJustSayNo) {
    // The original attacker accepts the JSN, action is cancelled
    state.pendingAction = null;
    state.phase = TurnPhase.Play;
    checkAutoEndTurn(state);
    return { ok: true, state, description: `${player.name} accepted the Just Say No` };
  }

  // Execute the actual steal/deal
  switch (pending.type) {
    case PendingActionType.RespondToSlyDeal: {
      if (!pending.targetCardId) break;
      const stolenCard = removeCardFromProperties(player, pending.targetCardId);
      if (stolenCard) {
        const color = stolenCard.color || PropertyColor.Brown;
        const group = getOrCreatePropertyGroup(fromPlayer, color);
        group.cards.push(stolenCard);
      }
      break;
    }
    case PendingActionType.RespondToForcedDeal: {
      if (!pending.offeredCardId || !pending.requestedCardId) break;
      const offered = removeCardFromProperties(fromPlayer, pending.offeredCardId);
      const requested = removeCardFromProperties(player, pending.requestedCardId);
      if (offered && requested) {
        const oColor = offered.color || PropertyColor.Brown;
        const rColor = requested.color || PropertyColor.Brown;
        getOrCreatePropertyGroup(player, oColor).cards.push(offered);
        getOrCreatePropertyGroup(fromPlayer, rColor).cards.push(requested);
      }
      break;
    }
    case PendingActionType.RespondToDealBreaker: {
      const targetColor = pending.targetCardId as unknown as PropertyColor;
      const groupIndex = player.properties.findIndex(
        (g) => g.color === targetColor
      );
      if (groupIndex !== -1) {
        const stolenGroup = player.properties.splice(groupIndex, 1)[0];
        // Transfer entire group including house/hotel
        const newGroup = getOrCreatePropertyGroup(fromPlayer, stolenGroup.color);
        newGroup.cards.push(...stolenGroup.cards);
        newGroup.hasHouse = stolenGroup.hasHouse;
        newGroup.hasHotel = stolenGroup.hasHotel;
      }
      break;
    }
  }

  pending.respondedPlayerIds.push(player.id);

  if (
    pending.respondedPlayerIds.length >= pending.targetPlayerIds.length
  ) {
    state.pendingAction = null;
    state.phase = TurnPhase.Play;

    // Check if the action resulted in a win
    if (hasWon(fromPlayer)) {
      state.winnerId = fromPlayer.id;
      state.phase = TurnPhase.GameOver;
    }

    checkAutoEndTurn(state);
  }

  const desc = `${player.name} accepted the action`;
  return { ok: true, state, description: desc };
}
