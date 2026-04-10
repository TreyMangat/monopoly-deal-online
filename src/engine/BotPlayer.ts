// ============================================================
// MONOPOLY DEAL ONLINE — Bot AI Player
// ============================================================
// Pure decision-making logic. No I/O, no side effects.
// Takes a full GameState + botId + difficulty, returns a PlayerAction.
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
} from "./helpers";

export type BotDifficulty = "easy" | "medium" | "hard";

// ---- Main Entry Point ----

export function chooseBotAction(
  state: GameState,
  botId: string,
  difficulty: BotDifficulty
): PlayerAction {
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
// EASY BOT — Random legal actions
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
        const g = bot.properties.find((pg) => pg.color === color);
        if (g && g.cards.length > 0) {
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
      // Can bank it
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
// HARD BOT — Full priority-based AI
// ============================================================

function chooseHardPlayAction(
  state: GameState,
  bot: PlayerState
): PlayerAction {
  if (state.actionsRemaining <= 0) {
    return { type: ActionType.EndTurn, playerId: bot.id };
  }

  const opponents = state.players.filter((p) => p.id !== bot.id);

  // Priority 0: If bank is empty and we have money cards, bank one first
  // (ensures bot can always pay something when targeted)
  if (totalBankValue(bot) === 0) {
    const urgentBank = checkBankMoney(bot);
    if (urgentBank) return urgentBank;
  }

  // Priority 1: Win check — play property to complete 3rd set
  const winAction = checkWinPlay(bot);
  if (winAction) return winAction;

  // Priority 2: House/Hotel on complete sets
  const houseHotelAction = checkHouseHotel(bot);
  if (houseHotelAction) return houseHotelAction;

  // Priority 3: Deal Breaker on opponent complete sets
  const dealBreakerAction = checkDealBreaker(bot, opponents);
  if (dealBreakerAction) return dealBreakerAction;

  // Priority 4: Double Rent + Rent combo
  const doubleRentAction = checkDoubleRentCombo(state, bot, opponents);
  if (doubleRentAction) return doubleRentAction;

  // Priority 5: Rent (without double)
  const rentAction = checkRent(bot, opponents);
  if (rentAction) return rentAction;

  // Priority 6: Sly Deal
  const slyDealAction = checkSlyDeal(bot, opponents);
  if (slyDealAction) return slyDealAction;

  // Priority 7: Wild card swap
  const wildSwapAction = checkWildCardSwap(bot);
  if (wildSwapAction) return wildSwapAction;

  // Priority 8: Play property from hand
  const propertyAction = checkPlayProperty(bot);
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

  // Priority 12: Debt Collector
  const debtAction = checkDebtCollector(bot, opponents);
  if (debtAction) return debtAction;

  // Priority 13: Bank money (always bank if nothing better to do)
  const bankMoneyAction = checkBankMoney(bot);
  if (bankMoneyAction) return bankMoneyAction;

  // Priority 14: Bank unusable action cards
  const bankActionAction = checkBankUnusableActions(bot, opponents);
  if (bankActionAction) return bankActionAction;

  // Priority 15: End turn
  return { type: ActionType.EndTurn, playerId: bot.id };
}

// ---- Priority 1: Win Check ----

function checkWinPlay(bot: PlayerState): PlayerAction | null {
  const completeSets = countCompleteSets(bot);
  if (completeSets < 2) return null;

  for (const card of bot.hand) {
    if (!isPropertyCard(card)) continue;

    const colors = getPlayableColors(card, bot);
    for (const color of colors) {
      const group = bot.properties.find((g) => g.color === color);
      const currentCount = group ? group.cards.length : 0;
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

// ---- Priority 2: House/Hotel ----

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

// ---- Priority 3: Deal Breaker ----

function checkDealBreaker(
  bot: PlayerState,
  opponents: PlayerState[]
): PlayerAction | null {
  const dbCard = bot.hand.find((c) => c.type === CardType.ActionDealBreaker);
  if (!dbCard) return null;

  let bestTarget: { oppId: string; color: PropertyColor; rent: number } | null = null;

  for (const opp of opponents) {
    for (const g of opp.properties) {
      if (!isSetComplete(g)) continue;
      const rent = calculateRent(g, false);
      if (!bestTarget || rent > bestTarget.rent) {
        bestTarget = { oppId: opp.id, color: g.color, rent };
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

// ---- Priority 4: Double Rent + Rent Combo ----

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
  const group = bot.properties.find((g) => g.color === rentCard.targetColor);
  if (!group || group.cards.length < 2) return null;

  return {
    type: ActionType.PlayDoubleRent,
    playerId: bot.id,
    cardId: drCard.id,
  };
}

// ---- Priority 5: Rent ----

function checkRent(
  bot: PlayerState,
  opponents: PlayerState[]
): PlayerAction | null {
  const rentInfo = findBestRentCard(bot, opponents);
  if (!rentInfo) return null;

  const group = bot.properties.find((g) => g.color === rentInfo.targetColor);
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
): { card: Card; targetColor: PropertyColor; targetPlayerId?: string } | null {
  let best: { card: Card; targetColor: PropertyColor; targetPlayerId?: string; rent: number } | null =
    null;

  for (const card of bot.hand) {
    if (card.type === CardType.RentTwoColor && card.rentColors) {
      for (const color of card.rentColors) {
        const group = bot.properties.find((g) => g.color === color);
        if (!group || group.cards.length === 0) continue;
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

// ---- Priority 6: Sly Deal ----

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
    for (const g of opp.properties) {
      if (isSetComplete(g)) continue;
      for (const card of g.cards) {
        const score = scoreSlyDealTarget(bot, card, g.color);
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
  const botGroup = bot.properties.find((g) => g.color === color);
  const currentCount = botGroup ? botGroup.cards.length : 0;
  const needed = SET_SIZE[color];

  if (currentCount === needed - 1) return 100; // Completes set
  if (currentCount > 0) return 50 + currentCount * 10; // Advances existing
  return 10; // New color
}

// ---- Priority 7: Wild Card Swap ----

function checkWildCardSwap(bot: PlayerState): PlayerAction | null {
  for (const group of bot.properties) {
    for (const card of group.cards) {
      if (
        card.type !== CardType.PropertyWild &&
        card.type !== CardType.PropertyWildAll
      )
        continue;

      const possibleColors = getPlayableColorsForWild(card, bot);
      for (const destColor of possibleColors) {
        if (destColor === group.color) continue;

        const destGroup = bot.properties.find((g) => g.color === destColor);
        const destCount = destGroup ? destGroup.cards.length : 0;
        const destNeeded = SET_SIZE[destColor];
        const srcCount = group.cards.length;
        const srcNeeded = SET_SIZE[group.color];

        // Would this move complete the destination set?
        if (destCount === destNeeded - 1) {
          // Worth it even if source loses completion (net same or better)
          return {
            type: ActionType.MoveWildCard,
            playerId: bot.id,
            cardId: card.id,
            destinationColor: destColor,
          };
        }

        // Move closer to completion: dest gets closer, source doesn't lose a complete set
        const destProgress = (destCount + 1) / destNeeded;
        const srcProgress = (srcCount - 1) / srcNeeded;
        const currentSrcProgress = srcCount / srcNeeded;
        const currentDestProgress = destCount / destNeeded;

        if (
          destProgress > currentDestProgress &&
          destProgress > currentSrcProgress &&
          !isSetComplete(group)
        ) {
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

// ---- Priority 8: Play Property ----

function checkPlayProperty(bot: PlayerState): PlayerAction | null {
  const propertyCards = bot.hand.filter(isPropertyCard);
  if (propertyCards.length === 0) return null;

  let bestPlay: { card: Card; color: PropertyColor; score: number } | null = null;

  for (const card of propertyCards) {
    const colors = getPlayableColors(card, bot);
    for (const color of colors) {
      const group = bot.properties.find((g) => g.color === color);
      const currentCount = group ? group.cards.length : 0;
      const needed = SET_SIZE[color];

      // Score: how close to completion
      const afterCount = currentCount + 1;
      let score = (afterCount / needed) * 100;

      // Bonus for completing a set
      if (afterCount >= needed) score += 200;

      // Bonus for advancing toward completion
      score += (needed - (needed - afterCount)) * 10;

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

// ---- Priority 9: Forced Deal ----

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

// ---- Priority 10: Pass Go ----

function checkPassGo(bot: PlayerState): PlayerAction | null {
  const card = bot.hand.find((c) => c.type === CardType.ActionPassGo);
  if (!card) return null;
  return {
    type: ActionType.PlayPassGo,
    playerId: bot.id,
    cardId: card.id,
  };
}

// ---- Priority 11: Birthday ----

function checkBirthday(bot: PlayerState): PlayerAction | null {
  const card = bot.hand.find((c) => c.type === CardType.ActionItsMyBirthday);
  if (!card) return null;
  return {
    type: ActionType.PlayBirthday,
    playerId: bot.id,
    cardId: card.id,
  };
}

// ---- Priority 12: Debt Collector ----

function checkDebtCollector(
  bot: PlayerState,
  opponents: PlayerState[]
): PlayerAction | null {
  const card = bot.hand.find((c) => c.type === CardType.ActionDebtCollector);
  if (!card) return null;

  // Target richest opponent
  const target = opponents.reduce((a, b) => {
    const aVal = totalBankValue(a) || totalAssetsValue(a);
    const bVal = totalBankValue(b) || totalAssetsValue(b);
    return aVal >= bVal ? a : b;
  });

  return {
    type: ActionType.PlayDebtCollector,
    playerId: bot.id,
    cardId: card.id,
    targetPlayerId: target.id,
  };
}

// ---- Priority 13: Bank Money ----

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

// ---- Priority 14: Bank Unusable Actions ----

function checkBankUnusableActions(
  bot: PlayerState,
  opponents: PlayerState[]
): PlayerAction | null {
  for (const card of bot.hand) {
    if (!isActionCard(card) && card.type !== CardType.RentTwoColor && card.type !== CardType.RentWild)
      continue;
    if (card.type === CardType.ActionJustSayNo) continue; // Keep JSN

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
        const g = bot.properties.find((pg) => pg.color === c);
        return g && g.cards.length > 0;
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
// MEDIUM BOT — Same priorities but no opponent analysis
// ============================================================

function chooseMediumPlayAction(
  state: GameState,
  bot: PlayerState
): PlayerAction {
  if (state.actionsRemaining <= 0) {
    return { type: ActionType.EndTurn, playerId: bot.id };
  }

  const opponents = state.players.filter((p) => p.id !== bot.id);

  // Priority 0: Bank money if bank is empty
  if (totalBankValue(bot) === 0) {
    const urgentBank = checkBankMoney(bot);
    if (urgentBank) return urgentBank;
  }

  // Priority 1: Win check
  const winAction = checkWinPlay(bot);
  if (winAction) return winAction;

  // Priority 2: House/Hotel
  const houseHotelAction = checkHouseHotel(bot);
  if (houseHotelAction) return houseHotelAction;

  // Priority 3: Deal Breaker (random opponent with complete set)
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

  // Skip priority 4 (double rent combo) — medium doesn't do combos

  // Priority 5: Rent (pick random valid target instead of optimal)
  for (const card of bot.hand) {
    if (card.type === CardType.RentTwoColor && card.rentColors) {
      for (const color of card.rentColors) {
        const g = bot.properties.find((pg) => pg.color === color);
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

  // Priority 6: Sly Deal (random valid target)
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

  // Skip priority 7 (wild card swap)

  // Priority 8: Play property
  const propertyAction = checkPlayProperty(bot);
  if (propertyAction) return propertyAction;

  // Skip priority 9 (forced deal — too complex for medium)

  // Priority 10: Pass Go
  const passGoAction = checkPassGo(bot);
  if (passGoAction) return passGoAction;

  // Priority 11: Birthday
  const birthdayAction = checkBirthday(bot);
  if (birthdayAction) return birthdayAction;

  // Priority 12: Debt Collector (random target)
  const dcCard = bot.hand.find((c) => c.type === CardType.ActionDebtCollector);
  if (dcCard && opponents.length > 0) {
    const randOpp = opponents[Math.floor(Math.random() * opponents.length)];
    return {
      type: ActionType.PlayDebtCollector,
      playerId: bot.id,
      cardId: dcCard.id,
      targetPlayerId: randOpp.id,
    };
  }

  // Priority 13: Bank money
  const bankMoneyAction = checkBankMoney(bot);
  if (bankMoneyAction) return bankMoneyAction;

  // Priority 14: Bank unusable
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
    return handlePaymentResponse(bot, pending, difficulty);
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
  bot: PlayerState,
  pending: any,
  difficulty: BotDifficulty
): PlayerAction {
  const amount = pending.amount || 0;

  // Check if we should JSN
  if (difficulty === "hard") {
    const jsn = bot.hand.find((c) => c.type === CardType.ActionJustSayNo);
    if (jsn) {
      // Use JSN if amount >= $5M
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
  if (difficulty === "hard" || difficulty === "medium") {
    const jsn = bot.hand.find((c) => c.type === CardType.ActionJustSayNo);
    if (jsn && pending.requestedCardId) {
      // Losing something we value > gaining what they offer
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
  // ALWAYS play JSN against Deal Breaker if available
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
      const group = bot.properties.find((g) => g.color === color);
      const currentCount = group ? group.cards.length : 0;
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

  if (card.type === CardType.ActionJustSayNo) return 35;
  if (card.type === CardType.ActionDealBreaker) return 30;
  if (card.type === CardType.ActionPassGo) return 25;
  if (card.type === CardType.Money) return card.bankValue * 3;
  if (card.type === CardType.ActionDoubleRent) return 15;

  // Other action cards
  return 5;
}

// ============================================================
// PAYMENT — Select cards to pay with
// ============================================================

function buildPaymentAction(
  bot: PlayerState,
  amount: number
): PlayerAction {
  // Calculate total payable value (excluding PropertyWildAll which can't be used)
  let totalPayable = 0;
  for (const c of bot.bank) totalPayable += c.bankValue;
  for (const g of bot.properties) {
    for (const c of g.cards) {
      if (c.type !== CardType.PropertyWildAll) totalPayable += c.bankValue;
    }
  }

  // If we can't cover the full amount, pay EVERYTHING payable
  if (totalPayable <= amount) {
    const cardIds: string[] = [];
    for (const c of bot.bank) cardIds.push(c.id);
    for (const g of bot.properties) {
      for (const c of g.cards) {
        if (c.type !== CardType.PropertyWildAll) cardIds.push(c.id);
      }
    }
    return { type: ActionType.PayWithCards, playerId: bot.id, cardIds };
  }

  // We CAN cover it — select optimally
  const cardIds: string[] = [];
  let paid = 0;

  // First: pay with bank cards, preferring lowest values
  const bankCards = [...bot.bank]
    .filter((c) => c.bankValue > 0)
    .sort((a, b) => a.bankValue - b.bankValue);

  for (const card of bankCards) {
    if (paid >= amount) break;
    cardIds.push(card.id);
    paid += card.bankValue;
  }

  if (paid >= amount) {
    return { type: ActionType.PayWithCards, playerId: bot.id, cardIds };
  }

  // Then: property cards from least valuable incomplete sets
  const propertyCards: { id: string; value: number; setProgress: number }[] = [];
  for (const group of bot.properties) {
    const needed = SET_SIZE[group.color];
    const progress = group.cards.length / needed;
    const complete = isSetComplete(group);

    for (const card of group.cards) {
      if (card.type === CardType.PropertyWildAll) continue;
      propertyCards.push({
        id: card.id,
        value: card.bankValue,
        setProgress: complete ? 999 : progress,
      });
    }
  }

  propertyCards.sort((a, b) => a.setProgress - b.setProgress || a.value - b.value);

  for (const pc of propertyCards) {
    if (paid >= amount) break;
    cardIds.push(pc.id);
    paid += pc.value;
  }

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
