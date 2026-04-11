// ============================================================
// MONOPOLY DEAL ONLINE — Engine Helpers
// ============================================================

import {
  Card,
  CardType,
  PlayerState,
  PropertyColor,
  PropertyGroup,
  GameState,
} from "../shared/types";
import {
  SET_SIZE,
  RENT_VALUES,
  HOUSE_RENT_BONUS,
  HOTEL_RENT_BONUS,
  SETS_TO_WIN,
} from "../shared/constants";

// ---- Shuffle (Fisher-Yates) ----

export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ---- Property Set Helpers ----

export function isSetComplete(group: PropertyGroup): boolean {
  const required = SET_SIZE[group.color];
  return group.cards.length >= required;
}

export function countCompleteSets(player: PlayerState): number {
  return player.properties.filter(isSetComplete).length;
}

export function hasWon(player: PlayerState): boolean {
  // Need 3 complete sets of DIFFERENT colors
  const completeSets = player.properties.filter(isSetComplete);
  const uniqueColors = new Set(completeSets.map((g) => g.color));
  return uniqueColors.size >= SETS_TO_WIN;
}

export function getPropertyGroup(
  player: PlayerState,
  color: PropertyColor
): PropertyGroup | undefined {
  return player.properties.find((g) => g.color === color);
}

/**
 * Find an incomplete group of the given color, or create a new one.
 * If all existing groups of this color are complete, a fresh group is created.
 * This allows multiple sets of the same color (e.g. 3/3 Green + 1/3 Green).
 */
export function getOrCreatePropertyGroup(
  player: PlayerState,
  color: PropertyColor
): PropertyGroup {
  // Prefer an existing incomplete group
  const incomplete = player.properties.find(
    (g) => g.color === color && !isSetComplete(g)
  );
  if (incomplete) return incomplete;

  // All groups of this color are complete (or none exist) — create a new one
  const group: PropertyGroup = { color, cards: [], hasHouse: false, hasHotel: false };
  player.properties.push(group);
  return group;
}

/**
 * Find the group of a color with the highest rent (for rent card charging).
 * Returns the complete set with house/hotel bonuses if one exists,
 * otherwise the group with the most cards.
 */
export function getBestGroupForColor(
  player: PlayerState,
  color: PropertyColor
): PropertyGroup | undefined {
  const groups = player.properties.filter(
    (g) => g.color === color && g.cards.length > 0
  );
  if (groups.length === 0) return undefined;
  if (groups.length === 1) return groups[0];
  // Pick the group with the highest calculated rent
  return groups.reduce((best, g) =>
    calculateRent(g) > calculateRent(best) ? g : best
  );
}

// ---- Rent Calculation ----

export function calculateRent(
  group: PropertyGroup,
  doubled: boolean = false
): number {
  if (group.cards.length === 0) return 0;

  const rentTier = RENT_VALUES[group.color];
  // Index is cards.length - 1, capped at max tier
  const tierIndex = Math.min(group.cards.length - 1, rentTier.length - 1);
  let rent = rentTier[tierIndex];

  // House/Hotel only apply to completed sets (not railroad/utility)
  if (
    isSetComplete(group) &&
    group.color !== PropertyColor.Railroad &&
    group.color !== PropertyColor.Utility
  ) {
    if (group.hasHouse) rent += HOUSE_RENT_BONUS;
    if (group.hasHotel) rent += HOTEL_RENT_BONUS;
  }

  if (doubled) rent *= 2;

  return rent;
}

// ---- Card Finding ----

export function findCardInHand(
  player: PlayerState,
  cardId: string
): Card | undefined {
  return player.hand.find((c) => c.id === cardId);
}

export function removeCardFromHand(
  player: PlayerState,
  cardId: string
): Card | undefined {
  const index = player.hand.findIndex((c) => c.id === cardId);
  if (index === -1) return undefined;
  return player.hand.splice(index, 1)[0];
}

export function findCardInProperties(
  player: PlayerState,
  cardId: string
): { card: Card; group: PropertyGroup } | undefined {
  for (const group of player.properties) {
    const card = group.cards.find((c) => c.id === cardId);
    if (card) return { card, group };
  }
  return undefined;
}

export function removeCardFromProperties(
  player: PlayerState,
  cardId: string
): Card | undefined {
  for (const group of player.properties) {
    const index = group.cards.findIndex((c) => c.id === cardId);
    if (index !== -1) {
      const wasComplete = isSetComplete(group);
      const card = group.cards.splice(index, 1)[0];

      // If removing this card broke a complete set, strip house/hotel
      // and convert them to money cards in the player's bank
      if (wasComplete && !isSetComplete(group)) {
        if (group.hasHotel) {
          group.hasHotel = false;
          player.bank.push({
            id: `hotel_money_${Date.now()}_${Math.random()}`,
            type: CardType.Money,
            name: "$4M (Hotel)",
            bankValue: 4,
          });
        }
        if (group.hasHouse) {
          group.hasHouse = false;
          player.bank.push({
            id: `house_money_${Date.now()}_${Math.random()}`,
            type: CardType.Money,
            name: "$3M (House)",
            bankValue: 3,
          });
        }
      }

      // Clean up empty groups
      if (group.cards.length === 0) {
        group.hasHouse = false;
        group.hasHotel = false;
        const groupIndex = player.properties.indexOf(group);
        if (groupIndex !== -1) player.properties.splice(groupIndex, 1);
      }
      return card;
    }
  }
  return undefined;
}

export function findCardInBank(
  player: PlayerState,
  cardId: string
): Card | undefined {
  return player.bank.find((c) => c.id === cardId);
}

export function removeCardFromBank(
  player: PlayerState,
  cardId: string
): Card | undefined {
  const index = player.bank.findIndex((c) => c.id === cardId);
  if (index === -1) return undefined;
  return player.bank.splice(index, 1)[0];
}

// ---- Payment Helpers ----

export function totalBankValue(player: PlayerState): number {
  return player.bank.reduce((sum, c) => sum + c.bankValue, 0);
}

export function totalPropertyValue(player: PlayerState): number {
  let total = 0;
  for (const group of player.properties) {
    for (const card of group.cards) {
      total += card.bankValue;
    }
    if (group.hasHouse) total += 3;
    if (group.hasHotel) total += 4;
  }
  return total;
}

export function totalAssetsValue(player: PlayerState): number {
  return totalBankValue(player) + totalPropertyValue(player);
}

// Can the player pay at least `amount` with their bank + properties?
// Note: In Monopoly Deal, if you can't pay the full amount, you pay what you can.
// You're never "bankrupt" — you just give everything you have.
export function canPayAnything(player: PlayerState): boolean {
  if (player.bank.length > 0) return true;
  // PropertyWildAll cards ($0 value) cannot be used for payment —
  // only count property groups that have at least one non-PropertyWildAll card
  return player.properties.some((g) =>
    g.cards.some((c) => c.type !== CardType.PropertyWildAll)
  );
}

// ---- Card Type Checks ----

export function isActionCard(card: Card): boolean {
  return [
    CardType.ActionPassGo,
    CardType.ActionDebtCollector,
    CardType.ActionItsMyBirthday,
    CardType.ActionForcedDeal,
    CardType.ActionSlyDeal,
    CardType.ActionDealBreaker,
    CardType.ActionJustSayNo,
    CardType.ActionDoubleRent,
    CardType.ActionHouse,
    CardType.ActionHotel,
  ].includes(card.type);
}

export function isPropertyCard(card: Card): boolean {
  return [
    CardType.Property,
    CardType.PropertyWild,
    CardType.PropertyWildAll,
  ].includes(card.type);
}

export function canCardGoToColor(
  card: Card,
  color: PropertyColor
): boolean {
  if (card.type === CardType.PropertyWildAll) return true;
  if (card.type === CardType.PropertyWild) {
    return card.color === color || card.altColor === color;
  }
  if (card.type === CardType.Property) {
    return card.color === color;
  }
  return false;
}

// ---- State Queries ----

export function getPlayer(
  state: GameState,
  playerId: string
): PlayerState | undefined {
  return state.players.find((p) => p.id === playerId);
}

export function getCurrentPlayer(state: GameState): PlayerState {
  return state.players[state.currentPlayerIndex];
}

export function drawCards(state: GameState, count: number): Card[] {
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    if (state.deck.length === 0) {
      // Reshuffle discard pile into deck (except top card)
      if (state.discardPile.length <= 1) break; // truly out of cards
      const top = state.discardPile.pop();
      state.deck = shuffle(state.discardPile);
      state.discardPile = top ? [top] : [];
    }
    const card = state.deck.pop();
    if (card) drawn.push(card);
  }
  return drawn;
}

// ---- Minimum-Overpayment Payment Calculator ----
// Used by both bot AI and server auto-pay on timeout.

export interface PayableCard {
  id: string;
  value: number;
  priority: number; // lower = sacrifice first
}

/**
 * Calculate the minimum set of cards to pay a debt.
 * Returns card IDs that cover `amount` with minimum overpayment.
 * Priority determines sacrifice order: lower priority = taken first.
 */
export function calculateMinimumPayment(
  player: PlayerState,
  amount: number
): string[] {
  const payable: PayableCard[] = [];

  // Bank cards — priority 0 (action cards) and 1 (money), sacrifice first
  for (const c of player.bank) {
    if (c.bankValue <= 0) continue;
    payable.push({
      id: c.id, value: c.bankValue,
      priority: c.type !== CardType.Money ? 0 : 1,
    });
  }

  // Property cards — higher priority (sacrifice last), prefer incomplete sets
  for (const group of player.properties) {
    const needed = SET_SIZE[group.color];
    const progress = group.cards.length / needed;
    const complete = isSetComplete(group);
    for (const card of group.cards) {
      if (card.type === CardType.PropertyWildAll) continue; // can't pay with rainbow
      const isWild = card.type === CardType.PropertyWild;
      payable.push({
        id: card.id, value: card.bankValue,
        priority: complete ? 100 : (10 + progress * 10 + (isWild ? 5 : 0)),
      });
    }
  }

  const totalPayable = payable.reduce((sum, c) => sum + c.value, 0);

  // Can't cover full amount — pay everything
  if (totalPayable <= amount) {
    return payable.map((c) => c.id);
  }

  // Sort by priority (sacrifice-first), then value ascending
  payable.sort((a, b) => a.priority - b.priority || a.value - b.value);

  // Subset-sum for small counts, greedy for larger
  const selected = payable.length <= 15
    ? findMinOverpaySubset(payable, amount)
    : greedyMinOverpay(payable, amount);

  return selected.map((c) => c.id);
}

function findMinOverpaySubset(
  cards: PayableCard[],
  amount: number
): PayableCard[] {
  const n = cards.length;
  let bestSubset: number[] | null = null;
  let bestTotal = Infinity;
  let bestCount = Infinity;

  const limit = 1 << n;
  for (let mask = 1; mask < limit; mask++) {
    let total = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) { total += cards[i].value; count++; }
    }
    if (total < amount) continue;
    const overpay = total - amount;
    const bestOverpay = bestTotal - amount;
    if (overpay < bestOverpay || (overpay === bestOverpay && count < bestCount)) {
      bestTotal = total;
      bestCount = count;
      bestSubset = [];
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) bestSubset.push(i);
      }
    }
  }
  return bestSubset ? bestSubset.map((i) => cards[i]) : cards;
}

function greedyMinOverpay(
  cards: PayableCard[],
  amount: number
): PayableCard[] {
  const sorted = [...cards].sort((a, b) => a.priority - b.priority || a.value - b.value);
  const selected: PayableCard[] = [];
  let paid = 0;
  for (const card of sorted) {
    if (paid >= amount) break;
    selected.push(card);
    paid += card.value;
  }
  // Remove unnecessary cards
  for (let i = selected.length - 1; i >= 0; i--) {
    if (paid - selected[i].value >= amount) {
      paid -= selected[i].value;
      selected.splice(i, 1);
    }
  }
  return selected;
}
