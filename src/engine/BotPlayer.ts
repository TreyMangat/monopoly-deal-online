// ============================================================
// MONOPOLY DEAL ONLINE — Bot AI Player
// ============================================================
// Meta strategy rewrite based on competitive Monopoly Deal play.
// Phase-aware decision making: early banking, mid-game strategy,
// late-game disruption. Pure logic — no I/O, no side effects.
// ============================================================

import {
  GameState,
  PlayerState,
  PlayerAction,
  ActionType,
  TurnPhase,
  CardType,
  PropertyColor,
  Card,
  PendingActionType,
  PropertyGroup,
} from "../shared/types";
import {
  SET_SIZE,
  RENT_VALUES,
  MAX_HAND_SIZE,
  HOUSE_RENT_BONUS,
  HOTEL_RENT_BONUS,
} from "../shared/constants";
import {
  isSetComplete,
  countCompleteSets,
  calculateRent,
  canCardGoToColor,
  totalBankValue,
  totalAssetsValue,
  isActionCard,
  isPropertyCard,
  findCardInProperties,
  getBestGroupForColor,
  calculateMinimumPayment,
} from "./helpers";

export type BotDifficulty = "easy" | "medium" | "hard";

// Game phase for hard bot strategy
type GamePhase = "early" | "mid" | "late";

// Value ranking of complete sets (for Deal Breaker targeting)
const SET_VALUE_RANK: Record<string, number> = {
  [PropertyColor.DarkBlue]: 100,
  [PropertyColor.Green]: 90,
  [PropertyColor.Red]: 80,
  [PropertyColor.Yellow]: 70,
  [PropertyColor.Orange]: 60,
  [PropertyColor.Pink]: 50,
  [PropertyColor.Railroad]: 45,
  [PropertyColor.LightBlue]: 40,
  [PropertyColor.Brown]: 30,
  [PropertyColor.Utility]: 20,
};

// Low-value colors safe to play in early game without bank protection
const LOW_VALUE_COLORS = new Set([
  PropertyColor.Brown,
  PropertyColor.Utility,
]);

// Track wild cards swapped this turn to prevent infinite loops
const swappedWildIds = new Set<string>();
let lastBotTurnNumber = -1;

// ---- Main Entry Point ----

export function chooseBotAction(
  state: GameState,
  botId: string,
  difficulty: BotDifficulty
): PlayerAction {
  // Reset swap tracking on new turn
  if (state.turnNumber !== lastBotTurnNumber) {
    swappedWildIds.clear();
    lastBotTurnNumber = state.turnNumber;
  }
  const bot = state.players.find((p) => p.id === botId);
  if (!bot) {
    return { type: ActionType.EndTurn, playerId: botId };
  }

  if (difficulty === "easy") {
    return chooseEasyAction(state, bot);
  }

  // Draw phase — always draw
  if (state.phase === TurnPhase.Draw) {
    return { type: ActionType.DrawCards, playerId: botId };
  }

  // Awaiting response — bot must respond
  if (state.phase === TurnPhase.AwaitingResponse && state.pendingAction) {
    return chooseResponseAction(state, bot, difficulty);
  }

  // Discard phase
  if (state.phase === TurnPhase.Discard) {
    return chooseDiscardAction(state, bot, difficulty);
  }

  // Play phase
  if (state.phase === TurnPhase.Play) {
    if (difficulty === "medium") {
      return chooseMediumPlayAction(state, bot);
    }
    return chooseHardPlayAction(state, bot);
  }

  return { type: ActionType.EndTurn, playerId: botId };
}

// ============================================================
// PHASE DETECTION & THREAT SCORING
// ============================================================

function getGamePhase(
  state: GameState,
  bot: PlayerState,
  opponents: PlayerState[]
): GamePhase {
  const botCompleteSets = countCompleteSets(bot);
  const bankValue = totalBankValue(bot);
  const numPlayers = state.players.length;

  // Late game: bot has 2+ complete sets OR any opponent close to winning
  if (botCompleteSets >= 2) return "late";
  for (const opp of opponents) {
    if (countCompleteSets(opp) >= 2) return "late";
  }

  // Early game: first 3 rounds OR bank < $5M
  const earlyTurnThreshold = numPlayers * 3;
  if (state.turnNumber <= earlyTurnThreshold || bankValue < 5) {
    return "early";
  }

  return "mid";
}

function computeThreatScore(player: PlayerState): number {
  const completeSets = countCompleteSets(player);
  const nearCompleteSets = player.properties.filter((g) => {
    const needed = SET_SIZE[g.color];
    return g.cards.length === needed - 1 && !isSetComplete(g);
  }).length;
  const bankValue = totalBankValue(player);
  return completeSets * 10 + nearCompleteSets * 5 + bankValue / 2;
}

function hasJSN(bot: PlayerState): boolean {
  return bot.hand.some((c) => c.type === CardType.ActionJustSayNo);
}

function opponentMayHaveJSN(opp: PlayerState): boolean {
  // If opponent has 4+ action cards in hand, assume they have JSN
  return opp.hand.length >= 4;
}

// ============================================================
// EASY BOT — Random legal actions with 50% bank bias
// ============================================================

function chooseEasyAction(state: GameState, bot: PlayerState): PlayerAction {
  if (state.phase === TurnPhase.Draw) {
    return { type: ActionType.DrawCards, playerId: bot.id };
  }

  if (state.phase === TurnPhase.AwaitingResponse && state.pendingAction) {
    return chooseEasyResponse(state, bot);
  }

  if (state.phase === TurnPhase.Discard) {
    return chooseRandomDiscard(state, bot);
  }

  if (state.phase === TurnPhase.Play) {
    return chooseRandomPlayAction(state, bot);
  }

  return { type: ActionType.EndTurn, playerId: bot.id };
}

function chooseEasyResponse(
  state: GameState,
  bot: PlayerState
): PlayerAction {
  const pending = state.pendingAction!;

  // Randomly decide to use JSN if available
  const jsn = bot.hand.find((c) => c.type === CardType.ActionJustSayNo);
  if (jsn && Math.random() < 0.5) {
    return {
      type: ActionType.PlayJustSayNo,
      playerId: bot.id,
      cardId: jsn.id,
    };
  }

  const isPayment = [
    PendingActionType.PayRent,
    PendingActionType.PayDebtCollector,
    PendingActionType.PayBirthday,
  ].includes(pending.type);

  if (isPayment) {
    return buildPaymentAction(bot, pending.amount || 0);
  }

  return { type: ActionType.AcceptAction, playerId: bot.id };
}

function chooseRandomDiscard(
  state: GameState,
  bot: PlayerState
): PlayerAction {
  const excess = bot.hand.length - MAX_HAND_SIZE;
  if (excess <= 0) {
    return { type: ActionType.EndTurn, playerId: bot.id };
  }
  // Engine rule: cannot discard property cards if enough non-property cards exist
  const nonPropertyCards = bot.hand.filter((c) => !isPropertyCard(c));
  let pool: Card[];
  if (nonPropertyCards.length >= excess) {
    pool = [...nonPropertyCards].sort(() => Math.random() - 0.5);
  } else {
    pool = [...bot.hand].sort(() => Math.random() - 0.5);
  }
  const cardIds = pool.slice(0, excess).map((c) => c.id);
  return {
    type: ActionType.DiscardCards,
    playerId: bot.id,
    cardIds,
  };
}

function chooseRandomPlayAction(
  state: GameState,
  bot: PlayerState
): PlayerAction {
  if (state.actionsRemaining <= 0) {
    return { type: ActionType.EndTurn, playerId: bot.id };
  }

  // 50% chance to bank money if available
  if (Math.random() < 0.5) {
    const moneyCard = bot.hand.find((c) => c.type === CardType.Money);
    if (moneyCard) {
      return {
        type: ActionType.PlayMoneyToBank,
        playerId: bot.id,
        cardId: moneyCard.id,
      };
    }
  }

  const actions = enumerateLegalActions(state, bot);
  if (actions.length === 0) {
    return { type: ActionType.EndTurn, playerId: bot.id };
  }

  // Add EndTurn as an option
  actions.push({ type: ActionType.EndTurn, playerId: bot.id });

  return actions[Math.floor(Math.random() * actions.length)];
}

function enumerateLegalActions(
  state: GameState,
  bot: PlayerState
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const opponents = state.players.filter((p) => p.id !== bot.id);

  for (const card of bot.hand) {
    // Money cards
    if (card.type === CardType.Money) {
      actions.push({
        type: ActionType.PlayMoneyToBank,
        playerId: bot.id,
        cardId: card.id,
      });
      continue;
    }

    // Property cards
    if (card.type === CardType.Property) {
      actions.push({
        type: ActionType.PlayPropertyCard,
        playerId: bot.id,
        cardId: card.id,
        destinationColor: card.color!,
      });
      continue;
    }

    if (card.type === CardType.PropertyWild) {
      if (card.color) {
        actions.push({
          type: ActionType.PlayPropertyCard,
          playerId: bot.id,
          cardId: card.id,
          destinationColor: card.color,
        });
      }
      if (card.altColor) {
        actions.push({
          type: ActionType.PlayPropertyCard,
          playerId: bot.id,
          cardId: card.id,
          destinationColor: card.altColor,
        });
      }
      continue;
    }

    if (card.type === CardType.PropertyWildAll) {
      // Can only go on existing property colors
      for (const group of bot.properties) {
        if (group.cards.length > 0) {
          actions.push({
            type: ActionType.PlayPropertyCard,
            playerId: bot.id,
            cardId: card.id,
            destinationColor: group.color,
          });
        }
      }
      continue;
    }

    // Action cards
    if (card.type === CardType.ActionPassGo) {
      actions.push({
        type: ActionType.PlayPassGo,
        playerId: bot.id,
        cardId: card.id,
      });
      continue;
    }

    if (card.type === CardType.ActionDebtCollector) {
      for (const opp of opponents) {
        actions.push({
          type: ActionType.PlayDebtCollector,
          playerId: bot.id,
          cardId: card.id,
          targetPlayerId: opp.id,
        });
      }
      continue;
    }

    if (card.type === CardType.ActionItsMyBirthday) {
      actions.push({
        type: ActionType.PlayBirthday,
        playerId: bot.id,
        cardId: card.id,
      });
      continue;
    }

    if (card.type === CardType.ActionSlyDeal) {
      for (const opp of opponents) {
        for (const g of opp.properties) {
          if (isSetComplete(g)) continue; // Can't steal from complete sets
          for (const c of g.cards) {
            actions.push({
              type: ActionType.PlaySlyDeal,
              playerId: bot.id,
              cardId: card.id,
              targetPlayerId: opp.id,
              targetCardId: c.id,
            });
          }
        }
      }
      continue;
    }

    if (card.type === CardType.ActionForcedDeal) {
      for (const opp of opponents) {
        for (const og of opp.properties) {
          if (isSetComplete(og)) continue;
          for (const oc of og.cards) {
            for (const mg of bot.properties) {
              if (isSetComplete(mg)) continue;
              for (const mc of mg.cards) {
                actions.push({
                  type: ActionType.PlayForcedDeal,
                  playerId: bot.id,
                  cardId: card.id,
                  targetPlayerId: opp.id,
                  offeredCardId: mc.id,
                  requestedCardId: oc.id,
                });
              }
            }
          }
        }
      }
      continue;
    }

    if (card.type === CardType.ActionDealBreaker) {
      for (const opp of opponents) {
        for (const g of opp.properties) {
          if (isSetComplete(g)) {
            actions.push({
              type: ActionType.PlayDealBreaker,
              playerId: bot.id,
              cardId: card.id,
              targetPlayerId: opp.id,
              targetColor: g.color,
            });
          }
        }
      }
      continue;
    }

    if (card.type === CardType.ActionHouse) {
      for (const g of bot.properties) {
        if (
          isSetComplete(g) &&
          !g.hasHouse &&
          g.color !== PropertyColor.Railroad &&
          g.color !== PropertyColor.Utility
        ) {
          actions.push({
            type: ActionType.PlayHouse,
            playerId: bot.id,
            cardId: card.id,
            targetColor: g.color,
          });
        }
      }
      continue;
    }

    if (card.type === CardType.ActionHotel) {
      for (const g of bot.properties) {
        if (
          isSetComplete(g) &&
          g.hasHouse &&
          !g.hasHotel &&
          g.color !== PropertyColor.Railroad &&
          g.color !== PropertyColor.Utility
        ) {
          actions.push({
            type: ActionType.PlayHotel,
            playerId: bot.id,
            cardId: card.id,
            targetColor: g.color,
          });
        }
      }
      continue;
    }

    if (card.type === CardType.ActionDoubleRent) {
      if (state.actionsRemaining >= 2) {
        actions.push({
          type: ActionType.PlayDoubleRent,
          playerId: bot.id,
          cardId: card.id,
        });
      }
      continue;
    }

    // Rent cards
    if (card.type === CardType.RentTwoColor && card.rentColors) {
      for (const color of card.rentColors) {
        const g = getBestGroupForColor(bot, color);
        if (g) {
          actions.push({
            type: ActionType.PlayRentCard,
            playerId: bot.id,
            cardId: card.id,
            targetColor: color,
          });
        }
      }
      continue;
    }

    if (card.type === CardType.RentWild) {
      for (const g of bot.properties) {
        if (g.cards.length > 0) {
          for (const opp of opponents) {
            actions.push({
              type: ActionType.PlayRentCard,
              playerId: bot.id,
              cardId: card.id,
              targetColor: g.color,
              targetPlayerId: opp.id,
            });
          }
        }
      }
      continue;
    }

    // JSN and DoubleRent can be banked
    if (card.type === CardType.ActionJustSayNo) {
      actions.push({
        type: ActionType.PlayActionToBank,
        playerId: bot.id,
        cardId: card.id,
      });
      continue;
    }

    // Any other action/rent card can be banked
    if (isActionCard(card) || card.type === CardType.RentTwoColor || card.type === CardType.RentWild) {
      actions.push({
        type: ActionType.PlayActionToBank,
        playerId: bot.id,
        cardId: card.id,
      });
    }
  }

  return actions;
}

// ============================================================
// HARD BOT — Phase-aware meta strategy
// ============================================================

function chooseHardPlayAction(
  state: GameState,
  bot: PlayerState
): PlayerAction {
  if (state.actionsRemaining <= 0) {
    return { type: ActionType.EndTurn, playerId: bot.id };
  }

  const opponents = state.players.filter((p) => p.id !== bot.id);

  // UNIVERSAL: Win check always first — play property to complete 3rd set
  const winAction = checkWinPlay(bot);
  if (winAction) return winAction;

  const phase = getGamePhase(state, bot, opponents);

  switch (phase) {
    case "early":
      return chooseEarlyGameAction(state, bot, opponents);
    case "mid":
      return chooseMidGameAction(state, bot, opponents);
    case "late":
      return chooseLateGameAction(state, bot, opponents);
  }
}

// ---- PHASE 1: EARLY GAME ----
// Bank first, protect yourself, avoid exposing completed sets

function chooseEarlyGameAction(
  state: GameState,
  bot: PlayerState,
  opponents: PlayerState[]
): PlayerAction {
  const bankValue = totalBankValue(bot);

  // Priority 1: BANK FIRST — if bank < $5M, bank money before anything
  if (bankValue < 5) {
    const bankAction = checkBankMoney(bot);
    if (bankAction) return bankAction;

    // Bank action cards as money if not immediately useful
    const bankActionCard = checkBankActionCardsEarly(bot, opponents);
    if (bankActionCard) return bankActionCard;
  }

  // Priority 2: Pass Go (draw more cards early is always good)
  if (bot.hand.length === 0) {
    // Pass Go is highest value when hand is empty
    const passGoAction = checkPassGo(bot);
    if (passGoAction) return passGoAction;
  }

  // Priority 3: Play low-value properties (brown, utility) even with low bank
  // Play any property if bank >= $5M, but AVOID completing sets in early game
  const propertyAction = checkPlayPropertyEarlyGame(bot, bankValue);
  if (propertyAction) return propertyAction;

  // Priority 4: Pass Go (if not empty hand)
  const passGoAction = checkPassGo(bot);
  if (passGoAction) return passGoAction;

  // Priority 5: Bank remaining money
  const bankAction = checkBankMoney(bot);
  if (bankAction) return bankAction;

  // Priority 6: Bank unusable actions
  const bankUnusable = checkBankUnusableActions(bot, opponents);
  if (bankUnusable) return bankUnusable;

  return { type: ActionType.EndTurn, playerId: bot.id };
}

// ---- PHASE 2: MID GAME ----
// Strategic play, targeted disruption, set building with protection

function chooseMidGameAction(
  state: GameState,
  bot: PlayerState,
  opponents: PlayerState[]
): PlayerAction {
  // Priority 1: House/Hotel on complete sets (increases rent value)
  const houseHotelAction = checkHouseHotel(bot);
  if (houseHotelAction) return houseHotelAction;

  // Priority 2: Deal Breaker on most valuable complete set
  const dealBreakerAction = checkDealBreaker(bot, opponents);
  if (dealBreakerAction) return dealBreakerAction;

  // Priority 3: Double Rent + Rent combo on richest opponent
  const doubleRentAction = checkDoubleRentCombo(state, bot, opponents);
  if (doubleRentAction) return doubleRentAction;

  // Priority 4: Rent (without double)
  const rentAction = checkRent(bot, opponents);
  if (rentAction) return rentAction;

  // Priority 5: Debt Collector — target POOREST (they must give properties)
  const debtAction = checkDebtCollector(bot, opponents, state.chargedThisTurn);
  if (debtAction) return debtAction;

  // Priority 6: Sly Deal to steal what completes YOUR set
  const slyDealAction = checkSlyDeal(bot, opponents);
  if (slyDealAction) return slyDealAction;

  // Priority 7: Wild card swap to complete a set
  const wildSwapAction = checkWildCardSwap(bot);
  if (wildSwapAction) return wildSwapAction;

  // Priority 8: Play property — near-complete sets, but avoid completing
  //             3rd set without JSN defense
  const propertyAction = checkPlayPropertyMidGame(state, bot);
  if (propertyAction) return propertyAction;

  // Priority 9: Forced Deal
  const forcedDealAction = checkForcedDeal(bot, opponents);
  if (forcedDealAction) return forcedDealAction;

  // Priority 10: Pass Go
  const passGoAction = checkPassGo(bot);
  if (passGoAction) return passGoAction;

  // Priority 11: Birthday
  const birthdayAction = checkBirthday(bot);
  if (birthdayAction) return birthdayAction;

  // Priority 12: Bank money
  const bankMoneyAction = checkBankMoney(bot);
  if (bankMoneyAction) return bankMoneyAction;

  // Priority 13: Bank unusable action cards
  const bankActionAction = checkBankUnusableActions(bot, opponents);
  if (bankActionAction) return bankActionAction;

  return { type: ActionType.EndTurn, playerId: bot.id };
}

// ---- PHASE 3: LATE GAME ----
// Aggressive disruption, win-or-deny strategy

function chooseLateGameAction(
  state: GameState,
  bot: PlayerState,
  opponents: PlayerState[]
): PlayerAction {
  // Priority 1: URGENT — If ANY opponent has 2+ complete sets, Deal Breaker NOW
  const urgentDB = checkUrgentDealBreaker(bot, opponents);
  if (urgentDB) return urgentDB;

  // Priority 2: Deal Breaker on any complete set (disrupt leader)
  const dealBreakerAction = checkDealBreaker(bot, opponents);
  if (dealBreakerAction) return dealBreakerAction;

  // Priority 3: Sly Deal bait — if we also have Deal Breaker, use Sly Deal
  //             first to draw out opponent's JSN, then DB next action
  const slyBait = checkSlyDealBait(state, bot, opponents);
  if (slyBait) return slyBait;

  // Priority 4: Double Rent combo
  const doubleRentAction = checkDoubleRentCombo(state, bot, opponents);
  if (doubleRentAction) return doubleRentAction;

  // Priority 5: Rent
  const rentAction = checkRent(bot, opponents);
  if (rentAction) return rentAction;

  // Priority 6: House/Hotel
  const houseHotelAction = checkHouseHotel(bot);
  if (houseHotelAction) return houseHotelAction;

  // Priority 7: Sly Deal (normal, for set completion)
  const slyDealAction = checkSlyDeal(bot, opponents);
  if (slyDealAction) return slyDealAction;

  // Priority 8: Play property — ONLY non-completing unless can win this turn
  const propertyAction = checkPlayPropertyLateGame(state, bot);
  if (propertyAction) return propertyAction;

  // Priority 9: Wild card swap
  const wildSwapAction = checkWildCardSwap(bot);
  if (wildSwapAction) return wildSwapAction;

  // Priority 10: Pass Go
  const passGoAction = checkPassGo(bot);
  if (passGoAction) return passGoAction;

  // Priority 11: Birthday
  const birthdayAction = checkBirthday(bot);
  if (birthdayAction) return birthdayAction;

  // Priority 12: Debt Collector (poorest)
  const debtAction = checkDebtCollector(bot, opponents, state.chargedThisTurn);
  if (debtAction) return debtAction;

  // Priority 13: Bank money
  const bankMoneyAction = checkBankMoney(bot);
  if (bankMoneyAction) return bankMoneyAction;

  // Priority 14: Bank unusable
  const bankActionAction = checkBankUnusableActions(bot, opponents);
  if (bankActionAction) return bankActionAction;

  return { type: ActionType.EndTurn, playerId: bot.id };
}

// ============================================================
// CHECK FUNCTIONS — Individual action evaluators
// ============================================================

// ---- Win Check ----

function checkWinPlay(bot: PlayerState): PlayerAction | null {
  const completeSets = countCompleteSets(bot);
  if (completeSets < 2) return null;

  for (const card of bot.hand) {
    if (!isPropertyCard(card)) continue;

    const colors = getPlayableColors(card, bot);
    for (const color of colors) {
      // Find the incomplete group the card would be added to (matches getOrCreatePropertyGroup)
      const incGroup = bot.properties.find(
        (g) => g.color === color && !isSetComplete(g)
      );
      const currentCount = incGroup ? incGroup.cards.length : 0;
      const needed = SET_SIZE[color];
      if (currentCount === needed - 1) {
        // This card completes this set!
        // Check if completing creates a 3rd unique complete set
        const completeColors = new Set(
          bot.properties.filter(isSetComplete).map((g) => g.color)
        );
        if (!completeColors.has(color)) {
          // This would be a new complete color, check if we hit 3
          if (completeColors.size + 1 >= 3) {
            return {
              type: ActionType.PlayPropertyCard,
              playerId: bot.id,
              cardId: card.id,
              destinationColor: color,
            };
          }
        }
      }
    }
  }
  return null;
}

// ---- House/Hotel ----

function checkHouseHotel(bot: PlayerState): PlayerAction | null {
  // Hotel first (higher value)
  const hotelCard = bot.hand.find((c) => c.type === CardType.ActionHotel);
  if (hotelCard) {
    for (const g of bot.properties) {
      if (
        isSetComplete(g) &&
        g.hasHouse &&
        !g.hasHotel &&
        g.color !== PropertyColor.Railroad &&
        g.color !== PropertyColor.Utility
      ) {
        return {
          type: ActionType.PlayHotel,
          playerId: bot.id,
          cardId: hotelCard.id,
          targetColor: g.color,
        };
      }
    }
  }

  const houseCard = bot.hand.find((c) => c.type === CardType.ActionHouse);
  if (houseCard) {
    for (const g of bot.properties) {
      if (
        isSetComplete(g) &&
        !g.hasHouse &&
        g.color !== PropertyColor.Railroad &&
        g.color !== PropertyColor.Utility
      ) {
        return {
          type: ActionType.PlayHouse,
          playerId: bot.id,
          cardId: houseCard.id,
          targetColor: g.color,
        };
      }
    }
  }
  return null;
}

// ---- Deal Breaker ----
// Score by set value ranking; in late game, urgently target leaders

function checkDealBreaker(
  bot: PlayerState,
  opponents: PlayerState[]
): PlayerAction | null {
  const dbCard = bot.hand.find((c) => c.type === CardType.ActionDealBreaker);
  if (!dbCard) return null;

  let bestTarget: { oppId: string; color: PropertyColor; score: number } | null = null;

  for (const opp of opponents) {
    const oppThreat = computeThreatScore(opp);
    for (const g of opp.properties) {
      if (!isSetComplete(g)) continue;
      // Score: set value ranking + threat bonus
      const setRank = SET_VALUE_RANK[g.color] || 0;
      const score = setRank + oppThreat * 5;
      if (!bestTarget || score > bestTarget.score) {
        bestTarget = { oppId: opp.id, color: g.color, score };
      }
    }
  }

  if (bestTarget) {
    return {
      type: ActionType.PlayDealBreaker,
      playerId: bot.id,
      cardId: dbCard.id,
      targetPlayerId: bestTarget.oppId,
      targetColor: bestTarget.color,
    };
  }
  return null;
}

// ---- Urgent Deal Breaker (Late Game) ----
// Specifically target opponents with 2+ complete sets

function checkUrgentDealBreaker(
  bot: PlayerState,
  opponents: PlayerState[]
): PlayerAction | null {
  const dbCard = bot.hand.find((c) => c.type === CardType.ActionDealBreaker);
  if (!dbCard) return null;

  // Find opponents with 2+ complete sets — they're about to win
  const urgentTargets: { oppId: string; color: PropertyColor; score: number }[] = [];

  for (const opp of opponents) {
    const oppCompleteSets = countCompleteSets(opp);
    if (oppCompleteSets < 2) continue;

    for (const g of opp.properties) {
      if (!isSetComplete(g)) continue;
      const setRank = SET_VALUE_RANK[g.color] || 0;
      urgentTargets.push({ oppId: opp.id, color: g.color, score: setRank + oppCompleteSets * 50 });
    }
  }

  if (urgentTargets.length > 0) {
    urgentTargets.sort((a, b) => b.score - a.score);
    const t = urgentTargets[0];
    return {
      type: ActionType.PlayDealBreaker,
      playerId: bot.id,
      cardId: dbCard.id,
      targetPlayerId: t.oppId,
      targetColor: t.color,
    };
  }
  return null;
}

// ---- Double Rent + Rent Combo ----

function checkDoubleRentCombo(
  state: GameState,
  bot: PlayerState,
  opponents: PlayerState[]
): PlayerAction | null {
  if (state.actionsRemaining < 2) return null;

  const drCard = bot.hand.find((c) => c.type === CardType.ActionDoubleRent);
  if (!drCard) return null;

  const rentCard = findBestRentCard(bot, opponents);
  if (!rentCard) return null;

  // Only use double rent if we have 2+ properties of that color
  const group = getBestGroupForColor(bot, rentCard.targetColor);
  if (!group || group.cards.length < 2) return null;

  return {
    type: ActionType.PlayDoubleRent,
    playerId: bot.id,
    cardId: drCard.id,
  };
}

// ---- Rent ----

function checkRent(
  bot: PlayerState,
  opponents: PlayerState[]
): PlayerAction | null {
  const rentInfo = findBestRentCard(bot, opponents);
  if (!rentInfo) return null;

  const group = getBestGroupForColor(bot, rentInfo.targetColor);
  if (!group || group.cards.length < 2) return null;

  const action: PlayerAction = {
    type: ActionType.PlayRentCard,
    playerId: bot.id,
    cardId: rentInfo.card.id,
    targetColor: rentInfo.targetColor,
  };

  if (rentInfo.card.type === CardType.RentWild) {
    action.targetPlayerId = rentInfo.targetPlayerId;
  }

  return action;
}

function findBestRentCard(
  bot: PlayerState,
  opponents: PlayerState[]
): { card: Card; targetColor: PropertyColor; targetPlayerId?: string; rent: number } | null {
  let best: { card: Card; targetColor: PropertyColor; targetPlayerId?: string; rent: number } | null =
    null;

  for (const card of bot.hand) {
    if (card.type === CardType.RentTwoColor && card.rentColors) {
      for (const color of card.rentColors) {
        const group = getBestGroupForColor(bot, color);
        if (!group) continue;
        const rent = calculateRent(group, false);
        if (!best || rent > best.rent) {
          best = { card, targetColor: color, rent };
        }
      }
    } else if (card.type === CardType.RentWild) {
      // Find best color and richest opponent
      const richestOpp = opponents.reduce((a, b) =>
        totalAssetsValue(a) > totalAssetsValue(b) ? a : b
      );
      let bestColor: PropertyColor | null = null;
      let bestRent = 0;
      for (const group of bot.properties) {
        if (group.cards.length === 0) continue;
        const rent = calculateRent(group, false);
        if (rent > bestRent) {
          bestRent = rent;
          bestColor = group.color;
        }
      }
      if (bestColor && bestRent > 0) {
        if (!best || bestRent > best.rent) {
          best = {
            card,
            targetColor: bestColor,
            targetPlayerId: richestOpp.id,
            rent: bestRent,
          };
        }
      }
    }
  }

  return best;
}

// ---- Sly Deal ----
// Prioritize stealing cards that complete YOUR sets

function checkSlyDeal(
  bot: PlayerState,
  opponents: PlayerState[]
): PlayerAction | null {
  const slyCard = bot.hand.find((c) => c.type === CardType.ActionSlyDeal);
  if (!slyCard) return null;

  let bestSteal: {
    oppId: string;
    cardId: string;
    score: number;
  } | null = null;

  for (const opp of opponents) {
    const oppThreat = computeThreatScore(opp);
    for (const g of opp.properties) {
      if (isSetComplete(g)) continue;
      for (const card of g.cards) {
        let score = scoreSlyDealTarget(bot, card, g.color);
        // Bonus for disrupting high-threat opponents
        score += oppThreat * 2;
        if (score > 0 && (!bestSteal || score > bestSteal.score)) {
          bestSteal = { oppId: opp.id, cardId: card.id, score };
        }
      }
    }
  }

  if (bestSteal) {
    return {
      type: ActionType.PlaySlyDeal,
      playerId: bot.id,
      cardId: slyCard.id,
      targetPlayerId: bestSteal.oppId,
      targetCardId: bestSteal.cardId,
    };
  }
  return null;
}

function scoreSlyDealTarget(
  bot: PlayerState,
  card: Card,
  color: PropertyColor
): number {
  const botGroup = bot.properties.find((g) => g.color === color && !isSetComplete(g));
  const currentCount = botGroup ? botGroup.cards.length : 0;
  const needed = SET_SIZE[color];

  if (currentCount === needed - 1) return 100; // Completes set!
  if (currentCount > 0) return 50 + currentCount * 10; // Advances existing
  // Bonus for 2-card sets (easy to complete)
  if (needed <= 2) return 25;
  return 10; // New color
}

// ---- Sly Deal Bait (Late Game) ----
// Use Sly Deal to bait out opponent's JSN before playing Deal Breaker

function checkSlyDealBait(
  state: GameState,
  bot: PlayerState,
  opponents: PlayerState[]
): PlayerAction | null {
  // Only bait if we have both Sly Deal AND Deal Breaker AND 2+ actions
  const slyCard = bot.hand.find((c) => c.type === CardType.ActionSlyDeal);
  const dbCard = bot.hand.find((c) => c.type === CardType.ActionDealBreaker);
  if (!slyCard || !dbCard || state.actionsRemaining < 2) return null;

  // Find an opponent with a complete set (DB target) who also has
  // incomplete sets (Sly Deal target) and might have JSN
  for (const opp of opponents) {
    const hasCompleteSet = opp.properties.some(isSetComplete);
    if (!hasCompleteSet) continue;
    if (!opponentMayHaveJSN(opp)) continue;

    // Find a stealable card from their incomplete sets
    for (const g of opp.properties) {
      if (isSetComplete(g)) continue;
      if (g.cards.length === 0) continue;
      return {
        type: ActionType.PlaySlyDeal,
        playerId: bot.id,
        cardId: slyCard.id,
        targetPlayerId: opp.id,
        targetCardId: g.cards[0].id,
      };
    }
  }
  return null;
}

// ---- Wild Card Swap ----

function checkWildCardSwap(bot: PlayerState): PlayerAction | null {
  for (const group of bot.properties) {
    for (const card of group.cards) {
      if (
        card.type !== CardType.PropertyWild &&
        card.type !== CardType.PropertyWildAll
      )
        continue;

      // Never swap the same wild twice in one turn (prevents infinite loops)
      if (swappedWildIds.has(card.id)) continue;

      const possibleColors = getPlayableColorsForWild(card, bot);
      for (const destColor of possibleColors) {
        if (destColor === group.color) continue;

        const destIncGroup = bot.properties.find((g) => g.color === destColor && !isSetComplete(g));
        const destCount = destIncGroup ? destIncGroup.cards.length : 0;
        const destNeeded = SET_SIZE[destColor];
        const srcCount = group.cards.length;

        // ONLY swap if it immediately completes the destination set
        // AND destination has strictly more cards than source after swap
        if (destCount === destNeeded - 1 && destCount >= srcCount - 1) {
          swappedWildIds.add(card.id);
          return {
            type: ActionType.MoveWildCard,
            playerId: bot.id,
            cardId: card.id,
            destinationColor: destColor,
          };
        }
      }
    }
  }
  return null;
}

// ---- Play Property (Early Game) ----
// Only play low-value properties or any if bank >= $5M. Avoid completing sets.

function checkPlayPropertyEarlyGame(
  bot: PlayerState,
  bankValue: number
): PlayerAction | null {
  const propertyCards = bot.hand.filter(isPropertyCard);
  if (propertyCards.length === 0) return null;

  // UNIVERSAL: hold wild cards as long as possible
  const nonWildProperties = propertyCards.filter(
    (c) => c.type !== CardType.PropertyWild && c.type !== CardType.PropertyWildAll
  );

  const candidates = nonWildProperties.length > 0 ? nonWildProperties : propertyCards;

  let bestPlay: { card: Card; color: PropertyColor; score: number } | null = null;

  for (const card of candidates) {
    const colors = getPlayableColors(card, bot);
    for (const color of colors) {
      const incGroup = bot.properties.find((g) => g.color === color && !isSetComplete(g));
      const currentCount = incGroup ? incGroup.cards.length : 0;
      const needed = SET_SIZE[color];

      // AVOID completing sets in early game — they become Deal Breaker targets
      if (currentCount === needed - 1) continue;

      // If bank < $5M, only play low-value colors
      if (bankValue < 5 && !LOW_VALUE_COLORS.has(color)) continue;

      // Score: prefer 2-card sets (easy to complete later)
      let score = needed <= 2 ? 50 : 20;
      score += (currentCount + 1) / needed * 30;

      if (!bestPlay || score > bestPlay.score) {
        bestPlay = { card, color, score };
      }
    }
  }

  if (bestPlay) {
    return {
      type: ActionType.PlayPropertyCard,
      playerId: bot.id,
      cardId: bestPlay.card.id,
      destinationColor: bestPlay.color,
    };
  }
  return null;
}

// ---- Play Property (Mid Game) ----
// Near-complete sets, but DON'T complete 3rd set without JSN defense

function checkPlayPropertyMidGame(
  state: GameState,
  bot: PlayerState
): PlayerAction | null {
  const propertyCards = bot.hand.filter(isPropertyCard);
  if (propertyCards.length === 0) return null;

  // Hold wild cards unless they complete a winning set
  const nonWildProperties = propertyCards.filter(
    (c) => c.type !== CardType.PropertyWild && c.type !== CardType.PropertyWildAll
  );

  const candidates = nonWildProperties.length > 0 ? nonWildProperties : propertyCards;
  const completeSets = countCompleteSets(bot);

  let bestPlay: { card: Card; color: PropertyColor; score: number } | null = null;

  for (const card of candidates) {
    const colors = getPlayableColors(card, bot);
    for (const color of colors) {
      const incGroup = bot.properties.find((g) => g.color === color && !isSetComplete(g));
      const currentCount = incGroup ? incGroup.cards.length : 0;
      const needed = SET_SIZE[color];

      const afterCount = currentCount + 1;
      let score = (afterCount / needed) * 100;

      // Would this complete a set?
      if (afterCount >= needed) {
        // Would this be the 3rd complete set? Only complete if we have JSN defense
        const wouldBeNew = !bot.properties.some(
          (g) => g.color === color && isSetComplete(g)
        );
        if (wouldBeNew && completeSets + 1 >= 3) {
          // This would win — already handled by checkWinPlay
          score += 300;
        } else if (wouldBeNew && completeSets + 1 >= 2 && !hasJSN(bot)) {
          // Completing 2nd set without JSN — risky but acceptable
          score += 100;
        } else {
          score += 200;
        }
      }

      // Bonus for 2-card sets
      if (needed <= 2) score += 30;

      // Bonus for advancing toward completion
      score += currentCount * 10;

      if (!bestPlay || score > bestPlay.score) {
        bestPlay = { card, color, score };
      }
    }
  }

  if (bestPlay) {
    return {
      type: ActionType.PlayPropertyCard,
      playerId: bot.id,
      cardId: bestPlay.card.id,
      destinationColor: bestPlay.color,
    };
  }
  return null;
}

// ---- Play Property (Late Game) ----
// Play properties but be very careful about completing — only if can win this turn

function checkPlayPropertyLateGame(
  state: GameState,
  bot: PlayerState
): PlayerAction | null {
  const propertyCards = bot.hand.filter(isPropertyCard);
  if (propertyCards.length === 0) return null;

  const completeSets = countCompleteSets(bot);

  let bestPlay: { card: Card; color: PropertyColor; score: number } | null = null;

  for (const card of propertyCards) {
    const colors = getPlayableColors(card, bot);
    for (const color of colors) {
      const incGroup = bot.properties.find((g) => g.color === color && !isSetComplete(g));
      const currentCount = incGroup ? incGroup.cards.length : 0;
      const needed = SET_SIZE[color];

      const afterCount = currentCount + 1;

      // Would this complete a set?
      if (afterCount >= needed) {
        const wouldBeNew = !bot.properties.some(
          (g) => g.color === color && isSetComplete(g)
        );
        if (wouldBeNew && completeSets + 1 >= 3) {
          // Winning play — already handled by checkWinPlay, but score high anyway
          return {
            type: ActionType.PlayPropertyCard,
            playerId: bot.id,
            cardId: card.id,
            destinationColor: color,
          };
        }
        // In late game, avoid completing non-winning sets (they get stolen)
        continue;
      }

      // Non-completing play — score by proximity
      let score = (afterCount / needed) * 100;
      score += currentCount * 10;
      if (needed <= 2) score += 30;

      if (!bestPlay || score > bestPlay.score) {
        bestPlay = { card, color, score };
      }
    }
  }

  if (bestPlay) {
    return {
      type: ActionType.PlayPropertyCard,
      playerId: bot.id,
      cardId: bestPlay.card.id,
      destinationColor: bestPlay.color,
    };
  }
  return null;
}

// ---- Forced Deal ----

function checkForcedDeal(
  bot: PlayerState,
  opponents: PlayerState[]
): PlayerAction | null {
  const fdCard = bot.hand.find((c) => c.type === CardType.ActionForcedDeal);
  if (!fdCard) return null;

  let bestTrade: {
    oppId: string;
    offeredCardId: string;
    requestedCardId: string;
    score: number;
  } | null = null;

  for (const opp of opponents) {
    for (const og of opp.properties) {
      if (isSetComplete(og)) continue;
      for (const oppCard of og.cards) {
        const wantScore = scoreSlyDealTarget(bot, oppCard, og.color);

        for (const mg of bot.properties) {
          if (isSetComplete(mg)) continue;
          for (const myCard of mg.cards) {
            // How much do we value what we're giving up?
            const giveUpScore = scoreMyPropertyValue(bot, myCard, mg);
            const netScore = wantScore - giveUpScore;
            if (netScore > 20 && (!bestTrade || netScore > bestTrade.score)) {
              bestTrade = {
                oppId: opp.id,
                offeredCardId: myCard.id,
                requestedCardId: oppCard.id,
                score: netScore,
              };
            }
          }
        }
      }
    }
  }

  if (bestTrade) {
    return {
      type: ActionType.PlayForcedDeal,
      playerId: bot.id,
      cardId: fdCard.id,
      targetPlayerId: bestTrade.oppId,
      offeredCardId: bestTrade.offeredCardId,
      requestedCardId: bestTrade.requestedCardId,
    };
  }
  return null;
}

function scoreMyPropertyValue(
  bot: PlayerState,
  card: Card,
  group: PropertyGroup
): number {
  const needed = SET_SIZE[group.color];
  const count = group.cards.length;
  // Lower score = more willing to give up
  if (count >= needed) return 100; // complete set — shouldn't give
  return (count / needed) * 50;
}

// ---- Pass Go ----

function checkPassGo(bot: PlayerState): PlayerAction | null {
  const card = bot.hand.find((c) => c.type === CardType.ActionPassGo);
  if (!card) return null;
  return {
    type: ActionType.PlayPassGo,
    playerId: bot.id,
    cardId: card.id,
  };
}

// ---- Birthday ----

function checkBirthday(bot: PlayerState): PlayerAction | null {
  const card = bot.hand.find((c) => c.type === CardType.ActionItsMyBirthday);
  if (!card) return null;
  return {
    type: ActionType.PlayBirthday,
    playerId: bot.id,
    cardId: card.id,
  };
}

// ---- Debt Collector ----
// META: Target POOREST opponent (lowest bank = must give properties)

function checkDebtCollector(
  bot: PlayerState,
  opponents: PlayerState[],
  chargedThisTurn?: Record<string, string[]>
): PlayerAction | null {
  const card = bot.hand.find((c) => c.type === CardType.ActionDebtCollector);
  if (!card) return null;

  // Filter out opponents already targeted by Debt Collector this turn
  const alreadyCharged = chargedThisTurn?.["debt_collector"] || [];
  const eligible = opponents.filter((opp) => !alreadyCharged.includes(opp.id));
  if (eligible.length === 0) return null;

  // Target the poorest eligible opponent — they can't pay cash so they must give properties
  const target = eligible.reduce((a, b) => {
    const aBank = totalBankValue(a);
    const bBank = totalBankValue(b);
    return aBank <= bBank ? a : b;
  });

  return {
    type: ActionType.PlayDebtCollector,
    playerId: bot.id,
    cardId: card.id,
    targetPlayerId: target.id,
  };
}

// ---- Bank Money ----

function checkBankMoney(bot: PlayerState): PlayerAction | null {
  const moneyCards = bot.hand
    .filter((c) => c.type === CardType.Money)
    .sort((a, b) => b.bankValue - a.bankValue);

  if (moneyCards.length > 0) {
    return {
      type: ActionType.PlayMoneyToBank,
      playerId: bot.id,
      cardId: moneyCards[0].id,
    };
  }
  return null;
}

// ---- Bank Action Cards (Early Game) ----
// Bank action cards that aren't immediately useful as money

function checkBankActionCardsEarly(
  bot: PlayerState,
  opponents: PlayerState[]
): PlayerAction | null {
  for (const card of bot.hand) {
    if (!isActionCard(card) && card.type !== CardType.RentTwoColor && card.type !== CardType.RentWild)
      continue;
    if (HIGH_VALUE_ACTIONS.has(card.type)) continue; // Never bank high-utility cards
    if (card.type === CardType.ActionPassGo) continue; // Pass Go is useful early

    // Bank cards that don't have viable targets right now
    let isUsable = false;

    if (card.type === CardType.ActionDebtCollector) {
      // In early game, bank Debt Collector — save it for mid game
      isUsable = false;
    } else if (card.type === CardType.ActionItsMyBirthday) {
      // Birthday is low-value early, bank it
      isUsable = false;
    } else if (card.type === CardType.RentTwoColor && card.rentColors) {
      isUsable = card.rentColors.some((c) => {
        const g = getBestGroupForColor(bot, c);
        return g && g.cards.length >= 2;
      });
    } else if (card.type === CardType.RentWild) {
      isUsable = bot.properties.some((g) => g.cards.length >= 2);
    } else {
      continue;
    }

    if (!isUsable) {
      return {
        type: ActionType.PlayActionToBank,
        playerId: bot.id,
        cardId: card.id,
      };
    }
  }
  return null;
}

// ---- Bank Unusable Actions ----

// High-utility action cards that medium/hard bots should never bank
const HIGH_VALUE_ACTIONS = new Set([
  CardType.ActionJustSayNo,
  CardType.ActionDealBreaker,
  CardType.ActionSlyDeal,
  CardType.ActionForcedDeal,
]);

function checkBankUnusableActions(
  bot: PlayerState,
  opponents: PlayerState[]
): PlayerAction | null {
  for (const card of bot.hand) {
    if (!isActionCard(card) && card.type !== CardType.RentTwoColor && card.type !== CardType.RentWild)
      continue;
    if (HIGH_VALUE_ACTIONS.has(card.type)) continue; // Never bank high-utility cards

    let isUsable = false;

    if (card.type === CardType.ActionSlyDeal) {
      isUsable = opponents.some((opp) =>
        opp.properties.some((g) => !isSetComplete(g) && g.cards.length > 0)
      );
    } else if (card.type === CardType.ActionDealBreaker) {
      isUsable = opponents.some((opp) =>
        opp.properties.some((g) => isSetComplete(g))
      );
    } else if (card.type === CardType.ActionForcedDeal) {
      isUsable =
        bot.properties.some((g) => !isSetComplete(g) && g.cards.length > 0) &&
        opponents.some((opp) =>
          opp.properties.some((g) => !isSetComplete(g) && g.cards.length > 0)
        );
    } else if (card.type === CardType.ActionHouse) {
      isUsable = bot.properties.some(
        (g) =>
          isSetComplete(g) &&
          !g.hasHouse &&
          g.color !== PropertyColor.Railroad &&
          g.color !== PropertyColor.Utility
      );
    } else if (card.type === CardType.ActionHotel) {
      isUsable = bot.properties.some(
        (g) =>
          isSetComplete(g) &&
          g.hasHouse &&
          !g.hasHotel &&
          g.color !== PropertyColor.Railroad &&
          g.color !== PropertyColor.Utility
      );
    } else if (card.type === CardType.RentTwoColor && card.rentColors) {
      isUsable = card.rentColors.some((c) => {
        const g = getBestGroupForColor(bot, c);
        return !!g;
      });
    } else if (card.type === CardType.RentWild) {
      isUsable = bot.properties.some((g) => g.cards.length > 0);
    } else if (card.type === CardType.ActionDoubleRent) {
      // Keep if we have rent cards
      isUsable = bot.hand.some(
        (c) =>
          c.type === CardType.RentTwoColor || c.type === CardType.RentWild
      );
    } else {
      // PassGo, Birthday, DebtCollector are always usable
      continue;
    }

    if (!isUsable) {
      return {
        type: ActionType.PlayActionToBank,
        playerId: bot.id,
        cardId: card.id,
      };
    }
  }
  return null;
}

// ============================================================
// MEDIUM BOT — Banking-first strategy, simple targeting
// ============================================================

function chooseMediumPlayAction(
  state: GameState,
  bot: PlayerState
): PlayerAction {
  if (state.actionsRemaining <= 0) {
    return { type: ActionType.EndTurn, playerId: bot.id };
  }

  const opponents = state.players.filter((p) => p.id !== bot.id);

  // Phase 1 banking rule: always bank until $5M
  if (totalBankValue(bot) < 5) {
    const urgentBank = checkBankMoney(bot);
    if (urgentBank) return urgentBank;
  }

  // Win check
  const winAction = checkWinPlay(bot);
  if (winAction) return winAction;

  // House/Hotel
  const houseHotelAction = checkHouseHotel(bot);
  if (houseHotelAction) return houseHotelAction;

  // Deal Breaker (random opponent with complete set — not optimized)
  const dbCard = bot.hand.find((c) => c.type === CardType.ActionDealBreaker);
  if (dbCard) {
    const targets = opponents.flatMap((opp) =>
      opp.properties
        .filter(isSetComplete)
        .map((g) => ({ oppId: opp.id, color: g.color }))
    );
    if (targets.length > 0) {
      const t = targets[Math.floor(Math.random() * targets.length)];
      return {
        type: ActionType.PlayDealBreaker,
        playerId: bot.id,
        cardId: dbCard.id,
        targetPlayerId: t.oppId,
        targetColor: t.color,
      };
    }
  }

  // Rent (pick random valid target instead of optimal)
  for (const card of bot.hand) {
    if (card.type === CardType.RentTwoColor && card.rentColors) {
      for (const color of card.rentColors) {
        const g = getBestGroupForColor(bot, color);
        if (g && g.cards.length >= 2) {
          return {
            type: ActionType.PlayRentCard,
            playerId: bot.id,
            cardId: card.id,
            targetColor: color,
          };
        }
      }
    } else if (card.type === CardType.RentWild) {
      const validGroup = bot.properties.find((g) => g.cards.length >= 2);
      if (validGroup && opponents.length > 0) {
        const randOpp =
          opponents[Math.floor(Math.random() * opponents.length)];
        return {
          type: ActionType.PlayRentCard,
          playerId: bot.id,
          cardId: card.id,
          targetColor: validGroup.color,
          targetPlayerId: randOpp.id,
        };
      }
    }
  }

  // Sly Deal (random valid target)
  const slyCard = bot.hand.find((c) => c.type === CardType.ActionSlyDeal);
  if (slyCard) {
    const targets: { oppId: string; cardId: string }[] = [];
    for (const opp of opponents) {
      for (const g of opp.properties) {
        if (isSetComplete(g)) continue;
        for (const card of g.cards) {
          targets.push({ oppId: opp.id, cardId: card.id });
        }
      }
    }
    if (targets.length > 0) {
      const t = targets[Math.floor(Math.random() * targets.length)];
      return {
        type: ActionType.PlaySlyDeal,
        playerId: bot.id,
        cardId: slyCard.id,
        targetPlayerId: t.oppId,
        targetCardId: t.cardId,
      };
    }
  }

  // Play property
  const propertyAction = checkPlayPropertyMidGame(state, bot);
  if (propertyAction) return propertyAction;

  // Pass Go
  const passGoAction = checkPassGo(bot);
  if (passGoAction) return passGoAction;

  // Birthday
  const birthdayAction = checkBirthday(bot);
  if (birthdayAction) return birthdayAction;

  // Debt Collector (random target)
  const dcCard = bot.hand.find((c) => c.type === CardType.ActionDebtCollector);
  if (dcCard && opponents.length > 0) {
    const alreadyCharged = state.chargedThisTurn?.["debt_collector"] || [];
    const eligibleDc = opponents.filter((opp) => !alreadyCharged.includes(opp.id));
    if (eligibleDc.length > 0) {
      const randOpp = eligibleDc[Math.floor(Math.random() * eligibleDc.length)];
      return {
        type: ActionType.PlayDebtCollector,
        playerId: bot.id,
        cardId: dcCard.id,
        targetPlayerId: randOpp.id,
      };
    }
  }

  // Bank money
  const bankMoneyAction = checkBankMoney(bot);
  if (bankMoneyAction) return bankMoneyAction;

  // Bank unusable
  const bankAction = checkBankUnusableActions(bot, opponents);
  if (bankAction) return bankAction;

  return { type: ActionType.EndTurn, playerId: bot.id };
}

// ============================================================
// RESPONSE ACTIONS — Bot is targeted
// ============================================================

function chooseResponseAction(
  state: GameState,
  bot: PlayerState,
  difficulty: BotDifficulty
): PlayerAction {
  const pending = state.pendingAction!;

  // Counter JSN — someone countered our JSN
  if (pending.type === PendingActionType.CounterJustSayNo) {
    return handleCounterJSN(state, bot, pending, difficulty);
  }

  const isPayment = [
    PendingActionType.PayRent,
    PendingActionType.PayDebtCollector,
    PendingActionType.PayBirthday,
  ].includes(pending.type);

  if (isPayment) {
    return handlePaymentResponse(state, bot, pending, difficulty);
  }

  if (pending.type === PendingActionType.RespondToSlyDeal) {
    return handleSlyDealResponse(bot, pending, difficulty);
  }

  if (pending.type === PendingActionType.RespondToForcedDeal) {
    return handleForcedDealResponse(bot, pending, difficulty);
  }

  if (pending.type === PendingActionType.RespondToDealBreaker) {
    return handleDealBreakerResponse(bot, pending, difficulty);
  }

  return { type: ActionType.AcceptAction, playerId: bot.id };
}

function handlePaymentResponse(
  state: GameState,
  bot: PlayerState,
  pending: any,
  difficulty: BotDifficulty
): PlayerAction {
  const amount = pending.amount || 0;

  if (difficulty === "hard") {
    const jsn = bot.hand.find((c) => c.type === CardType.ActionJustSayNo);
    if (jsn) {
      const opponents = state.players.filter((p) => p.id !== bot.id);
      const phase = getGamePhase(state, bot, opponents);

      // Late game: save JSN for Deal Breaker defense only
      if (phase === "late") {
        // Only use JSN if paying would lose near-complete set properties AND amount is high
        if (amount >= 8 && totalBankValue(bot) < amount) {
          return {
            type: ActionType.PlayJustSayNo,
            playerId: bot.id,
            cardId: jsn.id,
          };
        }
      } else {
        // Mid/early game: use JSN if amount >= $5M
        if (amount >= 5) {
          return {
            type: ActionType.PlayJustSayNo,
            playerId: bot.id,
            cardId: jsn.id,
          };
        }
        // Also use JSN if paying would sacrifice near-complete set properties
        if (totalBankValue(bot) < amount) {
          const wouldLoseProperty = bot.properties.some((g) => {
            const needed = SET_SIZE[g.color];
            return g.cards.length >= needed - 1 && g.cards.length > 0;
          });
          if (wouldLoseProperty) {
            return {
              type: ActionType.PlayJustSayNo,
              playerId: bot.id,
              cardId: jsn.id,
            };
          }
        }
      }
    }
  }

  return buildPaymentAction(bot, amount);
}

function handleSlyDealResponse(
  bot: PlayerState,
  pending: any,
  difficulty: BotDifficulty
): PlayerAction {
  if (difficulty === "hard") {
    const jsn = bot.hand.find((c) => c.type === CardType.ActionJustSayNo);
    if (jsn && pending.targetCardId) {
      // Check if targeted card is in a near-complete set
      for (const g of bot.properties) {
        const card = g.cards.find((c: Card) => c.id === pending.targetCardId);
        if (card) {
          const needed = SET_SIZE[g.color];
          if (g.cards.length >= needed - 1) {
            return {
              type: ActionType.PlayJustSayNo,
              playerId: bot.id,
              cardId: jsn.id,
            };
          }
        }
      }
    }
  }
  return { type: ActionType.AcceptAction, playerId: bot.id };
}

function handleForcedDealResponse(
  bot: PlayerState,
  pending: any,
  difficulty: BotDifficulty
): PlayerAction {
  // Only hard uses JSN for forced deal (medium saves JSN for Deal Breaker only)
  if (difficulty === "hard") {
    const jsn = bot.hand.find((c) => c.type === CardType.ActionJustSayNo);
    if (jsn && pending.requestedCardId) {
      for (const g of bot.properties) {
        const card = g.cards.find((c: Card) => c.id === pending.requestedCardId);
        if (card) {
          const needed = SET_SIZE[g.color];
          if (g.cards.length >= needed - 1) {
            return {
              type: ActionType.PlayJustSayNo,
              playerId: bot.id,
              cardId: jsn.id,
            };
          }
        }
      }
    }
  }
  return { type: ActionType.AcceptAction, playerId: bot.id };
}

function handleDealBreakerResponse(
  bot: PlayerState,
  pending: any,
  difficulty: BotDifficulty
): PlayerAction {
  // ALWAYS play JSN against Deal Breaker if available (all difficulties)
  const jsn = bot.hand.find((c) => c.type === CardType.ActionJustSayNo);
  if (jsn) {
    return {
      type: ActionType.PlayJustSayNo,
      playerId: bot.id,
      cardId: jsn.id,
    };
  }
  return { type: ActionType.AcceptAction, playerId: bot.id };
}

function handleCounterJSN(
  state: GameState,
  bot: PlayerState,
  pending: any,
  difficulty: BotDifficulty
): PlayerAction {
  // Someone JSN'd our action — should we counter?
  const jsn = bot.hand.find((c) => c.type === CardType.ActionJustSayNo);

  if (jsn && difficulty === "hard") {
    // Counter if original action was high-value (amount >= 5 or doubled rent >= 8)
    const originalAmount = pending.amount || 0;
    if (originalAmount >= 5) {
      return {
        type: ActionType.PlayJustSayNo,
        playerId: bot.id,
        cardId: jsn.id,
      };
    }
  }

  return { type: ActionType.AcceptAction, playerId: bot.id };
}

// ============================================================
// DISCARD — Score-based card selection
// ============================================================

function chooseDiscardAction(
  state: GameState,
  bot: PlayerState,
  difficulty: BotDifficulty
): PlayerAction {
  const excess = bot.hand.length - MAX_HAND_SIZE;
  if (excess <= 0) {
    return { type: ActionType.EndTurn, playerId: bot.id };
  }

  if (difficulty === "easy") {
    return chooseRandomDiscard(state, bot);
  }

  // Engine rule: cannot discard property cards if enough non-property cards exist
  const nonPropertyCards = bot.hand.filter((c) => !isPropertyCard(c));
  const mustUseNonProperty = nonPropertyCards.length >= excess;

  const pool = mustUseNonProperty ? nonPropertyCards : bot.hand;
  const scored = pool.map((card) => ({
    card,
    score: scoreCardForKeeping(bot, card),
  }));
  scored.sort((a, b) => a.score - b.score);

  const cardIds = scored.slice(0, excess).map((s) => s.card.id);
  return {
    type: ActionType.DiscardCards,
    playerId: bot.id,
    cardIds,
  };
}

function scoreCardForKeeping(bot: PlayerState, card: Card): number {
  // Property that completes a set
  if (isPropertyCard(card)) {
    const colors = getPlayableColors(card, bot);
    let bestScore = 5;
    for (const color of colors) {
      const incGroup = bot.properties.find((g) => g.color === color && !isSetComplete(g));
      const currentCount = incGroup ? incGroup.cards.length : 0;
      const needed = SET_SIZE[color];
      if (currentCount === needed - 1) {
        bestScore = Math.max(bestScore, 100);
      } else if (currentCount > 0) {
        bestScore = Math.max(bestScore, 50 + (needed - (needed - currentCount)) * 10);
      } else {
        bestScore = Math.max(bestScore, 20);
      }
    }
    return bestScore;
  }

  // Rent card matching owned color
  if (card.type === CardType.RentTwoColor && card.rentColors) {
    const matches = card.rentColors.some((c) => {
      const g = bot.properties.find((pg) => pg.color === c);
      return g && g.cards.length > 0;
    });
    return matches ? 40 : 5;
  }
  if (card.type === CardType.RentWild) {
    return bot.properties.some((g) => g.cards.length > 0) ? 40 : 5;
  }

  if (card.type === CardType.ActionDealBreaker) return 45;
  if (card.type === CardType.ActionJustSayNo) return 35;
  if (card.type === CardType.ActionSlyDeal) return 30;
  if (card.type === CardType.ActionForcedDeal) return 28;
  if (card.type === CardType.ActionPassGo) return 25;
  if (card.type === CardType.Money) return card.bankValue * 3;
  if (card.type === CardType.ActionDoubleRent) return 15;

  // Other action cards
  return 5;
}

// ============================================================
// PAYMENT — Uses shared minimum-overpayment algorithm from helpers.ts
// ============================================================

function buildPaymentAction(
  bot: PlayerState,
  amount: number
): PlayerAction {
  const cardIds = calculateMinimumPayment(bot, amount);
  return { type: ActionType.PayWithCards, playerId: bot.id, cardIds };
}

// ============================================================
// UTILITIES
// ============================================================

function getPlayableColors(card: Card, bot: PlayerState): PropertyColor[] {
  if (card.type === CardType.Property && card.color) {
    return [card.color];
  }
  if (card.type === CardType.PropertyWild) {
    const colors: PropertyColor[] = [];
    if (card.color) colors.push(card.color);
    if (card.altColor) colors.push(card.altColor);
    return colors;
  }
  if (card.type === CardType.PropertyWildAll) {
    // Can only go to colors where bot already has properties
    return bot.properties
      .filter((g) => g.cards.length > 0)
      .map((g) => g.color);
  }
  return [];
}

function getPlayableColorsForWild(
  card: Card,
  bot: PlayerState
): PropertyColor[] {
  if (card.type === CardType.PropertyWild) {
    const colors: PropertyColor[] = [];
    if (card.color) colors.push(card.color);
    if (card.altColor) colors.push(card.altColor);
    return colors;
  }
  if (card.type === CardType.PropertyWildAll) {
    return bot.properties
      .filter((g) => g.cards.length > 0)
      .map((g) => g.color);
  }
  return [];
}
