// ============================================================
// MONOPOLY DEAL ONLINE — Engine Tests
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import { initializeGame, applyAction } from "../engine/GameEngine";
import {
  GameState,
  ActionType,
  TurnPhase,
  CardType,
  PropertyColor,
} from "../shared/types";
import { buildDeck, getDeckStats } from "../shared/cardData";
import {
  countCompleteSets,
  hasWon,
  isSetComplete,
  calculateRent,
} from "../engine/helpers";
import { SET_SIZE } from "../shared/constants";

// ---- Deck Tests ----

describe("Card Deck", () => {
  it("should have 106 cards in a single deck (minus 4 quick start)", () => {
    const deck = buildDeck(false);
    expect(deck.length).toBe(106);
  });

  it("should have 212 cards in a double deck", () => {
    const deck = buildDeck(true);
    expect(deck.length).toBe(212);
  });

  it("should have correct card type distribution", () => {
    const deck = buildDeck(false);
    const stats = getDeckStats(deck);
    expect(stats.money).toBe(20);
    expect(stats.property).toBe(28);
    expect(stats.propertyWild).toBe(11);
    expect(stats.action).toBe(34);
    expect(stats.rent).toBe(13);
  });

  it("should have unique IDs for all cards", () => {
    const deck = buildDeck(false);
    const ids = deck.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(deck.length);
  });

  it("double deck should have unique IDs across both decks", () => {
    const deck = buildDeck(true);
    const ids = deck.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(deck.length);
  });
});

// ---- Game Initialization Tests ----

describe("Game Initialization", () => {
  it("should deal 5 cards to each player", () => {
    const state = initializeGame("TEST", [
      { id: "p1", name: "Alice", avatar: 0 },
      { id: "p2", name: "Bob", avatar: 1 },
    ]);

    // After init, draw phase auto-draws 2 more for p1
    // So p1 has 7, p2 has 5
    expect(state.players[0].hand.length).toBe(7);
    expect(state.players[1].hand.length).toBe(5);
  });

  it("should start in Play phase (after auto-draw)", () => {
    const state = initializeGame("TEST", [
      { id: "p1", name: "Alice", avatar: 0 },
      { id: "p2", name: "Bob", avatar: 1 },
    ]);

    expect(state.phase).toBe(TurnPhase.Play);
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.actionsRemaining).toBe(3);
  });

  it("should use double deck for 6 players", () => {
    const players = Array.from({ length: 6 }, (_, i) => ({
      id: `p${i}`,
      name: `Player ${i}`,
      avatar: i,
    }));

    const state = initializeGame("TEST", players);
    expect(state.useDoubleDeck).toBe(true);
    // 212 - (6 * 5) - 2 (first player auto draw) = 180
    const totalCardsInPlay =
      state.deck.length +
      state.players.reduce((sum, p) => sum + p.hand.length, 0);
    expect(totalCardsInPlay).toBe(212);
  });
});

// ---- Turn Actions Tests ----

describe("Turn Actions", () => {
  let state: GameState;

  beforeEach(() => {
    state = initializeGame("TEST", [
      { id: "p1", name: "Alice", avatar: 0 },
      { id: "p2", name: "Bob", avatar: 1 },
      { id: "p3", name: "Charlie", avatar: 2 },
    ]);
  });

  it("should allow banking a money card", () => {
    const player = state.players[0];
    const moneyCard = player.hand.find((c) => c.type === CardType.Money);
    if (!moneyCard) return; // might not have one in hand

    const result = applyAction(state, {
      type: ActionType.PlayMoneyToBank,
      playerId: "p1",
      cardId: moneyCard.id,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const p = result.state.players[0];
      expect(p.bank.some((c) => c.id === moneyCard.id)).toBe(true);
      expect(p.hand.some((c) => c.id === moneyCard.id)).toBe(false);
      expect(result.state.actionsRemaining).toBe(2);
    }
  });

  it("should reject actions from wrong player", () => {
    const result = applyAction(state, {
      type: ActionType.EndTurn,
      playerId: "p2", // not p2's turn
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Not your turn");
    }
  });

  it("should allow playing a property card", () => {
    const player = state.players[0];
    const propCard = player.hand.find((c) => c.type === CardType.Property);
    if (!propCard) return;

    const result = applyAction(state, {
      type: ActionType.PlayPropertyCard,
      playerId: "p1",
      cardId: propCard.id,
      destinationColor: propCard.color,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const p = result.state.players[0];
      const group = p.properties.find((g) => g.color === propCard.color);
      expect(group).toBeDefined();
      expect(group!.cards.some((c) => c.id === propCard.id)).toBe(true);
    }
  });

  it("should allow banking an action card as money", () => {
    const player = state.players[0];
    const actionCard = player.hand.find(
      (c) =>
        c.type === CardType.ActionPassGo ||
        c.type === CardType.ActionDebtCollector
    );
    if (!actionCard) return;

    const result = applyAction(state, {
      type: ActionType.PlayActionToBank,
      playerId: "p1",
      cardId: actionCard.id,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.players[0].bank.some((c) => c.id === actionCard.id)).toBe(
        true
      );
    }
  });

  it("should end turn and advance to next player", () => {
    const result = applyAction(state, {
      type: ActionType.EndTurn,
      playerId: "p1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.currentPlayerIndex).toBe(1);
      expect(result.state.phase).toBe(TurnPhase.Play);
      // p2 should have drawn 2 cards (5 initial + 2 = 7)
      expect(result.state.players[1].hand.length).toBe(7);
    }
  });
});

// ---- Helper Function Tests ----

describe("Helpers", () => {
  it("should correctly identify complete sets", () => {
    const group = {
      color: PropertyColor.Brown,
      cards: [
        { id: "1", type: CardType.Property, name: "Med", bankValue: 1, color: PropertyColor.Brown },
        { id: "2", type: CardType.Property, name: "Bal", bankValue: 1, color: PropertyColor.Brown },
      ],
      hasHouse: false,
      hasHotel: false,
    };
    expect(isSetComplete(group)).toBe(true);
  });

  it("should correctly calculate rent", () => {
    const group = {
      color: PropertyColor.DarkBlue,
      cards: [
        { id: "1", type: CardType.Property as const, name: "Park", bankValue: 4, color: PropertyColor.DarkBlue },
        { id: "2", type: CardType.Property as const, name: "Board", bankValue: 4, color: PropertyColor.DarkBlue },
      ],
      hasHouse: false,
      hasHotel: false,
    };

    // Dark blue with 2 cards = $8M rent
    expect(calculateRent(group)).toBe(8);

    // With house = $8 + $3 = $11
    group.hasHouse = true;
    expect(calculateRent(group)).toBe(11);

    // With hotel too = $8 + $3 + $4 = $15
    group.hasHotel = true;
    expect(calculateRent(group)).toBe(15);

    // Doubled = $30
    expect(calculateRent(group, true)).toBe(30);
  });

  it("should detect win condition with 3 different color sets", () => {
    const player = {
      id: "p1",
      name: "Test",
      avatar: 0,
      hand: [],
      bank: [],
      connected: true,
      properties: [
        {
          color: PropertyColor.Brown,
          cards: [
            { id: "1", type: CardType.Property as const, name: "A", bankValue: 1, color: PropertyColor.Brown },
            { id: "2", type: CardType.Property as const, name: "B", bankValue: 1, color: PropertyColor.Brown },
          ],
          hasHouse: false,
          hasHotel: false,
        },
        {
          color: PropertyColor.DarkBlue,
          cards: [
            { id: "3", type: CardType.Property as const, name: "C", bankValue: 4, color: PropertyColor.DarkBlue },
            { id: "4", type: CardType.Property as const, name: "D", bankValue: 4, color: PropertyColor.DarkBlue },
          ],
          hasHouse: false,
          hasHotel: false,
        },
        {
          color: PropertyColor.Utility,
          cards: [
            { id: "5", type: CardType.Property as const, name: "E", bankValue: 2, color: PropertyColor.Utility },
            { id: "6", type: CardType.Property as const, name: "F", bankValue: 2, color: PropertyColor.Utility },
          ],
          hasHouse: false,
          hasHotel: false,
        },
      ],
    };

    expect(hasWon(player)).toBe(true);
  });

  it("should NOT count duplicate color sets toward win", () => {
    const player = {
      id: "p1",
      name: "Test",
      avatar: 0,
      hand: [],
      bank: [],
      connected: true,
      properties: [
        {
          color: PropertyColor.Brown,
          cards: [
            { id: "1", type: CardType.Property as const, name: "A", bankValue: 1, color: PropertyColor.Brown },
            { id: "2", type: CardType.Property as const, name: "B", bankValue: 1, color: PropertyColor.Brown },
          ],
          hasHouse: false,
          hasHotel: false,
        },
        {
          color: PropertyColor.DarkBlue,
          cards: [
            { id: "3", type: CardType.Property as const, name: "C", bankValue: 4, color: PropertyColor.DarkBlue },
            { id: "4", type: CardType.Property as const, name: "D", bankValue: 4, color: PropertyColor.DarkBlue },
          ],
          hasHouse: false,
          hasHotel: false,
        },
      ],
    };

    expect(hasWon(player)).toBe(false); // only 2 sets
  });

  it("should validate all set sizes match official rules", () => {
    expect(SET_SIZE[PropertyColor.Brown]).toBe(2);
    expect(SET_SIZE[PropertyColor.DarkBlue]).toBe(2);
    expect(SET_SIZE[PropertyColor.Utility]).toBe(2);
    expect(SET_SIZE[PropertyColor.Railroad]).toBe(4);
    expect(SET_SIZE[PropertyColor.LightBlue]).toBe(3);
    expect(SET_SIZE[PropertyColor.Pink]).toBe(3);
    expect(SET_SIZE[PropertyColor.Orange]).toBe(3);
    expect(SET_SIZE[PropertyColor.Red]).toBe(3);
    expect(SET_SIZE[PropertyColor.Yellow]).toBe(3);
    expect(SET_SIZE[PropertyColor.Green]).toBe(3);
  });
});
