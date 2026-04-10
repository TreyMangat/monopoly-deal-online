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
  drawCards,
  removeCardFromProperties,
} from "../engine/helpers";
import { SET_SIZE } from "../shared/constants";
import type { PlayerState, Card, GameState } from "../shared/types";

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

// ---- Double Rent Tests ----

describe("Double Rent", () => {
  function setupDoubleRentScenario() {
    const state = initializeGame("TEST", [
      { id: "p1", name: "Alice", avatar: 0 },
      { id: "p2", name: "Bob", avatar: 1 },
    ]);

    const player = state.players[0];

    // Give p1 a Double Rent card
    const doubleRentCard = {
      id: "test_double_rent",
      type: CardType.ActionDoubleRent,
      name: "Double the Rent",
      bankValue: 1,
    };
    player.hand.push(doubleRentCard);

    // Give p1 a 2-color rent card for dark blue / green
    const rentCard = {
      id: "test_rent_darkblue",
      type: CardType.RentTwoColor,
      name: "Rent (Dark Blue / Green)",
      bankValue: 1,
      rentColors: [PropertyColor.DarkBlue, PropertyColor.Green] as [PropertyColor, PropertyColor],
    };
    player.hand.push(rentCard);

    // Give p1 a dark blue property so rent is non-zero
    player.properties.push({
      color: PropertyColor.DarkBlue,
      cards: [
        { id: "test_park", type: CardType.Property, name: "Park Place", bankValue: 4, color: PropertyColor.DarkBlue },
      ],
      hasHouse: false,
      hasHotel: false,
    });

    // Give p2 some money so they can pay
    state.players[1].bank.push({
      id: "test_money_10",
      type: CardType.Money,
      name: "$10M",
      bankValue: 10,
    });

    return { state, doubleRentCard, rentCard };
  }

  it("should double rent when Double Rent is played before a rent card", () => {
    const { state, doubleRentCard, rentCard } = setupDoubleRentScenario();

    // Play Double Rent
    const r1 = applyAction(state, {
      type: ActionType.PlayDoubleRent,
      playerId: "p1",
      cardId: doubleRentCard.id,
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.state.doubleRentActive).toBe(true);

    // Play Rent card — should be doubled
    const r2 = applyAction(r1.state, {
      type: ActionType.PlayRentCard,
      playerId: "p1",
      cardId: rentCard.id,
      targetColor: PropertyColor.DarkBlue,
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;

    // Dark blue with 1 property = $3 base rent, doubled = $6
    expect(r2.state.pendingAction).not.toBeNull();
    expect(r2.state.pendingAction!.amount).toBe(6);
    expect(r2.state.pendingAction!.isDoubled).toBe(true);
  });

  it("should reset doubleRentActive after rent is charged", () => {
    const { state, doubleRentCard, rentCard } = setupDoubleRentScenario();

    // Play Double Rent
    const r1 = applyAction(state, {
      type: ActionType.PlayDoubleRent,
      playerId: "p1",
      cardId: doubleRentCard.id,
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    // Play Rent card
    const r2 = applyAction(r1.state, {
      type: ActionType.PlayRentCard,
      playerId: "p1",
      cardId: rentCard.id,
      targetColor: PropertyColor.DarkBlue,
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;

    expect(r2.state.doubleRentActive).toBe(false);
  });

  it("should reject Double Rent when fewer than 2 actions remaining", () => {
    const { state, doubleRentCard } = setupDoubleRentScenario();

    // Burn 2 actions so only 1 remains
    state.actionsRemaining = 1;

    const result = applyAction(state, {
      type: ActionType.PlayDoubleRent,
      playerId: "p1",
      cardId: doubleRentCard.id,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("at least 2 actions");
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

// ---- Reshuffle / Empty Deck Tests ----

describe("Reshuffle and Empty Deck", () => {
  it("should safely return no cards when deck and discard are both empty", () => {
    const state: GameState = {
      roomCode: "TEST",
      deck: [],
      discardPile: [],
      players: [],
      currentPlayerIndex: 0,
      actionsRemaining: 3,
      phase: TurnPhase.Play,
      pendingAction: null,
      turnNumber: 1,
      winnerId: null,
      useDoubleDeck: false,
      doubleRentActive: false,
    };

    const drawn = drawCards(state, 2);
    expect(drawn.length).toBe(0);
    expect(state.deck.length).toBe(0);
    expect(state.discardPile.length).toBe(0);
  });

  it("should reshuffle discard into deck when deck runs out mid-draw", () => {
    const discardCards: Card[] = [
      { id: "d1", type: CardType.Money, name: "$1M", bankValue: 1 },
      { id: "d2", type: CardType.Money, name: "$2M", bankValue: 2 },
      { id: "d3", type: CardType.Money, name: "$3M", bankValue: 3 },
    ];
    const state: GameState = {
      roomCode: "TEST",
      deck: [{ id: "deck1", type: CardType.Money, name: "$5M", bankValue: 5 }],
      discardPile: discardCards,
      players: [],
      currentPlayerIndex: 0,
      actionsRemaining: 3,
      phase: TurnPhase.Play,
      pendingAction: null,
      turnNumber: 1,
      winnerId: null,
      useDoubleDeck: false,
      doubleRentActive: false,
    };

    const drawn = drawCards(state, 3);
    // Should draw 1 from deck + 2 from reshuffled discard (top card stays)
    expect(drawn.length).toBe(3);
  });

  it("should not break Pass Go when deck has fewer than 2 cards", () => {
    const state = initializeGame("TEST", [
      { id: "p1", name: "Alice", avatar: 0 },
      { id: "p2", name: "Bob", avatar: 1 },
    ]);

    const player = state.players[0];

    // Give p1 a Pass Go card
    const passGoCard: Card = {
      id: "test_pass_go",
      type: CardType.ActionPassGo,
      name: "Pass Go",
      bankValue: 1,
    };
    player.hand.push(passGoCard);

    // Empty the deck to 1 card
    state.deck.splice(0, state.deck.length);
    state.deck.push({ id: "lone_card", type: CardType.Money, name: "$1M", bankValue: 1 });
    state.discardPile = [];

    const result = applyAction(state, {
      type: ActionType.PlayPassGo,
      playerId: "p1",
      cardId: passGoCard.id,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should have drawn only 1 card (the lone card), not error
      // Pass Go card goes to discard, so discard has 1 card
      expect(result.state.deck.length).toBe(0);
    }
  });

  it("should not error when Pass Go is played with 0 cards in deck", () => {
    const state = initializeGame("TEST", [
      { id: "p1", name: "Alice", avatar: 0 },
      { id: "p2", name: "Bob", avatar: 1 },
    ]);

    const player = state.players[0];
    const passGoCard: Card = {
      id: "test_pass_go_empty",
      type: CardType.ActionPassGo,
      name: "Pass Go",
      bankValue: 1,
    };
    player.hand.push(passGoCard);

    // Completely empty deck and discard
    state.deck = [];
    state.discardPile = [];

    const handSizeBefore = player.hand.length;

    const result = applyAction(state, {
      type: ActionType.PlayPassGo,
      playerId: "p1",
      cardId: passGoCard.id,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Hand should be handSizeBefore - 1 (Pass Go removed, 0 drawn)
      // But Pass Go was discarded, and discard pile is now usable for reshuffle
      // With empty discard before play, the Pass Go card goes to discard
      // then drawCards tries to draw 2 from empty deck, reshuffles discard (1 card = top, can't reshuffle)
      // So 0 cards drawn
      const p = result.state.players[0];
      expect(p.hand.length).toBe(handSizeBefore - 1);
    }
  });
});

// ---- Wild Card Payment Tests ----

describe("Wild Card Color on Payment", () => {
  it("should place 2-color wild to primary color in receiver's properties", () => {
    const state = initializeGame("TEST", [
      { id: "p1", name: "Alice", avatar: 0 },
      { id: "p2", name: "Bob", avatar: 1 },
    ]);

    const p1 = state.players[0];
    const p2 = state.players[1];

    // Give p1 a debt collector
    const debtCard: Card = {
      id: "test_debt",
      type: CardType.ActionDebtCollector,
      name: "Debt Collector",
      bankValue: 3,
      actionValue: 5,
    };
    p1.hand.push(debtCard);

    // Give p2 a 2-color wild (DarkBlue/Green) in their properties
    const wildCard: Card = {
      id: "test_wild_2color",
      type: CardType.PropertyWild,
      name: "Wild DarkBlue/Green",
      bankValue: 4,
      color: PropertyColor.DarkBlue,
      altColor: PropertyColor.Green,
    };
    p2.properties.push({
      color: PropertyColor.DarkBlue,
      cards: [wildCard],
      hasHouse: false,
      hasHotel: false,
    });

    // Play debt collector
    const r1 = applyAction(state, {
      type: ActionType.PlayDebtCollector,
      playerId: "p1",
      cardId: debtCard.id,
      targetPlayerId: "p2",
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    // p2 pays with the wild card
    const r2 = applyAction(r1.state, {
      type: ActionType.PayWithCards,
      playerId: "p2",
      cardIds: [wildCard.id],
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;

    // The 2-color wild should go to p1's properties at its primary color (DarkBlue)
    const p1After = r2.state.players[0];
    const dbGroup = p1After.properties.find(
      (g) => g.color === PropertyColor.DarkBlue
    );
    expect(dbGroup).toBeDefined();
    expect(dbGroup!.cards.some((c) => c.id === wildCard.id)).toBe(true);
  });

  it("should place rainbow wild in receiver's bank (not properties)", () => {
    const state = initializeGame("TEST", [
      { id: "p1", name: "Alice", avatar: 0 },
      { id: "p2", name: "Bob", avatar: 1 },
    ]);

    const p1 = state.players[0];
    const p2 = state.players[1];

    // Give p1 a debt collector
    const debtCard: Card = {
      id: "test_debt_rainbow",
      type: CardType.ActionDebtCollector,
      name: "Debt Collector",
      bankValue: 3,
      actionValue: 5,
    };
    p1.hand.push(debtCard);

    // Give p2 a rainbow wild in their properties
    const rainbowWild: Card = {
      id: "test_rainbow_wild",
      type: CardType.PropertyWildAll,
      name: "Wild Property",
      bankValue: 0,
    };
    p2.properties.push({
      color: PropertyColor.Brown,
      cards: [rainbowWild],
      hasHouse: false,
      hasHotel: false,
    });

    // Also give p2 some money to make it easy
    const moneyCard: Card = {
      id: "test_money_5",
      type: CardType.Money,
      name: "$5M",
      bankValue: 5,
    };
    p2.bank.push(moneyCard);

    // Play debt collector
    const r1 = applyAction(state, {
      type: ActionType.PlayDebtCollector,
      playerId: "p1",
      cardId: debtCard.id,
      targetPlayerId: "p2",
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    // p2 pays with the rainbow wild + money
    const r2 = applyAction(r1.state, {
      type: ActionType.PayWithCards,
      playerId: "p2",
      cardIds: [rainbowWild.id, moneyCard.id],
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;

    // Rainbow wild should go to p1's BANK, not properties
    const p1After = r2.state.players[0];
    expect(p1After.bank.some((c) => c.id === rainbowWild.id)).toBe(true);
    // Should NOT be in any property group
    const inProperties = p1After.properties.some((g) =>
      g.cards.some((c) => c.id === rainbowWild.id)
    );
    expect(inProperties).toBe(false);
  });
});

// ---- House/Hotel Teardown on Payment Tests ----

describe("House/Hotel Teardown on Payment", () => {
  it("should strip house and hotel when removing a card breaks a complete set", () => {
    const player: PlayerState = {
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
            { id: "b1", type: CardType.Property, name: "Mediterranean", bankValue: 1, color: PropertyColor.Brown },
            { id: "b2", type: CardType.Property, name: "Baltic", bankValue: 1, color: PropertyColor.Brown },
          ],
          hasHouse: true,
          hasHotel: true,
        },
      ],
    };

    const removed = removeCardFromProperties(player, "b1");
    expect(removed).toBeDefined();
    expect(removed!.id).toBe("b1");

    // House and hotel should be stripped
    const group = player.properties[0];
    expect(group.hasHouse).toBe(false);
    expect(group.hasHotel).toBe(false);

    // Should have $3M (house) + $4M (hotel) money cards in bank
    expect(player.bank.length).toBe(2);
    const bankValues = player.bank.map((c) => c.bankValue).sort();
    expect(bankValues).toEqual([3, 4]);
  });

  it("should strip only house when set has house but no hotel", () => {
    const player: PlayerState = {
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
            { id: "b1", type: CardType.Property, name: "Mediterranean", bankValue: 1, color: PropertyColor.Brown },
            { id: "b2", type: CardType.Property, name: "Baltic", bankValue: 1, color: PropertyColor.Brown },
          ],
          hasHouse: true,
          hasHotel: false,
        },
      ],
    };

    removeCardFromProperties(player, "b1");

    const group = player.properties[0];
    expect(group.hasHouse).toBe(false);
    expect(player.bank.length).toBe(1);
    expect(player.bank[0].bankValue).toBe(3);
  });

  it("should NOT strip house/hotel when set remains complete after removal", () => {
    // A 3-card color with 4 cards (overstacked) — removing one still leaves 3
    const player: PlayerState = {
      id: "p1",
      name: "Test",
      avatar: 0,
      hand: [],
      bank: [],
      connected: true,
      properties: [
        {
          color: PropertyColor.Red,
          cards: [
            { id: "r1", type: CardType.Property, name: "Kentucky", bankValue: 3, color: PropertyColor.Red },
            { id: "r2", type: CardType.Property, name: "Indiana", bankValue: 3, color: PropertyColor.Red },
            { id: "r3", type: CardType.Property, name: "Illinois", bankValue: 3, color: PropertyColor.Red },
            { id: "r4", type: CardType.PropertyWildAll, name: "Wild", bankValue: 0 },
          ],
          hasHouse: true,
          hasHotel: false,
        },
      ],
    };

    removeCardFromProperties(player, "r4");

    const group = player.properties[0];
    // Still complete (3 cards for Red), house should remain
    expect(group.hasHouse).toBe(true);
    expect(player.bank.length).toBe(0);
  });
});

// ---- Empty Hand Draw Test ----

describe("Empty Hand Draw", () => {
  it("should draw 5 cards when player has 0 cards at start of turn", () => {
    const state = initializeGame("TEST", [
      { id: "p1", name: "Alice", avatar: 0 },
      { id: "p2", name: "Bob", avatar: 1 },
    ]);

    // End p1's turn
    const r1 = applyAction(state, {
      type: ActionType.EndTurn,
      playerId: "p1",
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    // Now it's p2's turn (auto-drew 2 cards, so p2 has 7)
    // End p2's turn
    const r2 = applyAction(r1.state, {
      type: ActionType.EndTurn,
      playerId: "p2",
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;

    // It's p1's turn again. Force p1's hand to empty BEFORE the draw happens.
    // Since performDraw already happened, we need to set up differently.
    // Instead, let's manipulate state directly before advancing turn.
    const state2 = initializeGame("TEST", [
      { id: "p1", name: "Alice", avatar: 0 },
      { id: "p2", name: "Bob", avatar: 1 },
    ]);

    // Empty p2's hand to simulate 0 cards at turn start
    state2.players[1].hand = [];

    // End p1's turn — this advances to p2 and auto-draws
    const r3 = applyAction(state2, {
      type: ActionType.EndTurn,
      playerId: "p1",
    });
    expect(r3.ok).toBe(true);
    if (!r3.ok) return;

    // p2 had 0 cards, should have drawn 5
    expect(r3.state.players[1].hand.length).toBe(5);
  });
});

// ---- Double Deck Distribution Test ----

describe("Double Deck Distribution", () => {
  it("should have exactly 212 cards with correct distribution", () => {
    const deck = buildDeck(true);
    expect(deck.length).toBe(212);

    const stats = getDeckStats(deck);
    // Double of single deck: 20*2=40 money, 28*2=56 property, 11*2=22 wild, 34*2=68 action, 13*2=26 rent
    expect(stats.money).toBe(40);
    expect(stats.property).toBe(56);
    expect(stats.propertyWild).toBe(22);
    expect(stats.action).toBe(68);
    expect(stats.rent).toBe(26);
  });
});
