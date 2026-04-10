// ============================================================
// MONOPOLY DEAL ONLINE — Full Game Integration Tests
// ============================================================
// Simulates complete 3-player games using only the engine.
// No WebSocket, no server — pure applyAction() chains.
// ============================================================

import { describe, it, expect } from "vitest";
import { applyAction, EngineResult } from "../engine/GameEngine";
import {
  GameState,
  ActionType,
  TurnPhase,
  CardType,
  PropertyColor,
  Card,
  PendingActionType,
} from "../shared/types";

// ---- Helpers ----

function prop(id: string, color: PropertyColor, name: string, value: number): Card {
  return { id, type: CardType.Property, name, bankValue: value, color };
}

function money(id: string, value: number): Card {
  return { id, type: CardType.Money, name: `$${value}M`, bankValue: value };
}

/** Unwrap a successful EngineResult or fail the test. */
function ok(result: EngineResult): GameState {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/**
 * Creates a deterministic 3-player game state (P1's turn, Play phase).
 *
 * P1 (Alice): 7 cards in hand, $10M in bank, Brown + Utility complete sets
 * P2 (Bob):   5 cards in hand, no bank, DarkBlue (1/2 incomplete)
 * P3 (Charlie): 5 cards in hand, $4M in bank, Red (2/3 incomplete)
 *
 * Deck has 10 money cards (drawn from end via pop).
 */
function createTestGame(): GameState {
  return {
    roomCode: "INTTEST",
    deck: [
      // bottom → drawn last
      money("dk10", 1), money("dk9", 1), money("dk8", 1), money("dk7", 1),
      money("dk6", 1), money("dk5", 1), money("dk4", 1), money("dk3", 1),
      money("dk2", 2), money("dk1", 2),
      // top → drawn first (popped)
    ],
    discardPile: [],
    players: [
      {
        id: "p1", name: "Alice", avatar: 0,
        hand: [
          prop("stcharles", PropertyColor.Pink, "St. Charles Place", 2),
          money("m1_p1", 1),
          { id: "jsn1", type: CardType.ActionJustSayNo, name: "Just Say No", bankValue: 4 },
          prop("oriental", PropertyColor.LightBlue, "Oriental Avenue", 1),
          prop("vermont", PropertyColor.LightBlue, "Vermont Avenue", 1),
          prop("connecticut", PropertyColor.LightBlue, "Connecticut Avenue", 1),
          money("m5_p1", 5),
        ],
        bank: [money("m10_p1", 10)],
        properties: [
          { color: PropertyColor.Brown, cards: [
            prop("med", PropertyColor.Brown, "Mediterranean Avenue", 1),
            prop("baltic", PropertyColor.Brown, "Baltic Avenue", 1),
          ], hasHouse: false, hasHotel: false },
          { color: PropertyColor.Utility, cards: [
            prop("electric", PropertyColor.Utility, "Electric Company", 2),
            prop("water", PropertyColor.Utility, "Water Works", 2),
          ], hasHouse: false, hasHotel: false },
        ],
        connected: true,
      },
      {
        id: "p2", name: "Bob", avatar: 1,
        hand: [
          { id: "passgo1", type: CardType.ActionPassGo, name: "Pass Go", bankValue: 1 },
          { id: "rent_db_g", type: CardType.RentTwoColor, name: "Rent: DB/G", bankValue: 1,
            rentColors: [PropertyColor.DarkBlue, PropertyColor.Green] as [PropertyColor, PropertyColor] },
          { id: "dblrent1", type: CardType.ActionDoubleRent, name: "Double the Rent", bankValue: 1 },
          { id: "dealbrk1", type: CardType.ActionDealBreaker, name: "Deal Breaker", bankValue: 5 },
          money("m3_p2", 3),
        ],
        bank: [],
        properties: [
          { color: PropertyColor.DarkBlue, cards: [
            prop("boardwalk", PropertyColor.DarkBlue, "Boardwalk", 4),
          ], hasHouse: false, hasHotel: false },
        ],
        connected: true,
      },
      {
        id: "p3", name: "Charlie", avatar: 2,
        hand: [
          { id: "slydeal1", type: CardType.ActionSlyDeal, name: "Sly Deal", bankValue: 3 },
          { id: "bday1", type: CardType.ActionItsMyBirthday, name: "It's My Birthday",
            bankValue: 2, actionValue: 2 },
          prop("kentucky", PropertyColor.Red, "Kentucky Avenue", 3),
          { id: "forceddeal1", type: CardType.ActionForcedDeal, name: "Forced Deal", bankValue: 3 },
          money("m2_p3", 2),
        ],
        bank: [money("m4_p3", 4)],
        properties: [
          { color: PropertyColor.Red, cards: [
            prop("indiana", PropertyColor.Red, "Indiana Avenue", 3),
            prop("illinois", PropertyColor.Red, "Illinois Avenue", 3),
          ], hasHouse: false, hasHotel: false },
        ],
        connected: true,
      },
    ],
    currentPlayerIndex: 0,
    actionsRemaining: 3,
    phase: TurnPhase.Play,
    pendingAction: null,
    turnNumber: 1,
    winnerId: null,
    useDoubleDeck: false,
    doubleRentActive: false,
  };
}

// ---- Tests ----

describe("Full Game Integration", () => {

  it("plays a complete 3-player game from start to win", () => {
    let s = createTestGame();

    // ---- Turn 1: P1 plays property, banks money, ends turn ----
    s = ok(applyAction(s, {
      type: ActionType.PlayPropertyCard, playerId: "p1",
      cardId: "stcharles", destinationColor: PropertyColor.Pink,
    }));
    expect(s.actionsRemaining).toBe(2);
    expect(s.players[0].properties.find(g => g.color === PropertyColor.Pink)).toBeDefined();

    s = ok(applyAction(s, {
      type: ActionType.PlayMoneyToBank, playerId: "p1", cardId: "m1_p1",
    }));
    expect(s.players[0].bank).toHaveLength(2);

    s = ok(applyAction(s, { type: ActionType.EndTurn, playerId: "p1" }));
    expect(s.currentPlayerIndex).toBe(1);
    expect(s.players[1].hand).toHaveLength(7); // 5 + 2 auto-drawn
    expect(s.turnNumber).toBe(2);

    // ---- Turn 2: P2 plays Pass Go, charges rent, collects payment ----
    s = ok(applyAction(s, {
      type: ActionType.PlayPassGo, playerId: "p2", cardId: "passgo1",
    }));
    expect(s.players[1].hand).toHaveLength(8); // 7 - 1 + 2 drawn

    s = ok(applyAction(s, {
      type: ActionType.PlayRentCard, playerId: "p2",
      cardId: "rent_db_g", targetColor: PropertyColor.DarkBlue,
    }));
    expect(s.phase).toBe(TurnPhase.AwaitingResponse);
    expect(s.pendingAction!.amount).toBe(3); // DarkBlue 1 card = $3M
    expect(s.pendingAction!.targetPlayerIds).toContain("p1");
    expect(s.pendingAction!.targetPlayerIds).toContain("p3");

    // P1 pays $10M from bank (overpayment — no change given)
    s = ok(applyAction(s, {
      type: ActionType.PayWithCards, playerId: "p1", cardIds: ["m10_p1"],
    }));
    // P3 pays $4M from bank (overpayment)
    s = ok(applyAction(s, {
      type: ActionType.PayWithCards, playerId: "p3", cardIds: ["m4_p3"],
    }));
    expect(s.phase).toBe(TurnPhase.Play);
    // P2 collected both payments
    expect(s.players[1].bank.some(c => c.id === "m10_p1")).toBe(true);
    expect(s.players[1].bank.some(c => c.id === "m4_p3")).toBe(true);

    s = ok(applyAction(s, { type: ActionType.EndTurn, playerId: "p2" }));
    expect(s.currentPlayerIndex).toBe(2);
    expect(s.turnNumber).toBe(3);

    // ---- Turn 3: P3 Sly Deal → P1 Just Say No → P3 accepts ----
    s = ok(applyAction(s, {
      type: ActionType.PlaySlyDeal, playerId: "p3", cardId: "slydeal1",
      targetPlayerId: "p1", targetCardId: "stcharles",
    }));
    expect(s.pendingAction!.type).toBe(PendingActionType.RespondToSlyDeal);

    s = ok(applyAction(s, {
      type: ActionType.PlayJustSayNo, playerId: "p1", cardId: "jsn1",
    }));
    expect(s.pendingAction!.type).toBe(PendingActionType.CounterJustSayNo);
    expect(s.pendingAction!.targetPlayerIds).toEqual(["p3"]);

    s = ok(applyAction(s, { type: ActionType.AcceptAction, playerId: "p3" }));
    expect(s.phase).toBe(TurnPhase.Play);
    // St. Charles stayed with P1
    const pinkGroup = s.players[0].properties.find(g => g.color === PropertyColor.Pink);
    expect(pinkGroup!.cards[0].id).toBe("stcharles");

    s = ok(applyAction(s, { type: ActionType.EndTurn, playerId: "p3" }));
    expect(s.currentPlayerIndex).toBe(0);
    expect(s.turnNumber).toBe(4);

    // ---- Turn 4: P1 completes LightBlue → 3 complete sets → WIN ----
    // P1 has Brown(2/2), Utility(2/2) complete. LightBlue cards in hand.
    s = ok(applyAction(s, {
      type: ActionType.PlayPropertyCard, playerId: "p1",
      cardId: "oriental", destinationColor: PropertyColor.LightBlue,
    }));
    s = ok(applyAction(s, {
      type: ActionType.PlayPropertyCard, playerId: "p1",
      cardId: "vermont", destinationColor: PropertyColor.LightBlue,
    }));
    s = ok(applyAction(s, {
      type: ActionType.PlayPropertyCard, playerId: "p1",
      cardId: "connecticut", destinationColor: PropertyColor.LightBlue,
    }));

    expect(s.phase).toBe(TurnPhase.GameOver);
    expect(s.winnerId).toBe("p1");
    const lb = s.players[0].properties.find(g => g.color === PropertyColor.LightBlue);
    expect(lb!.cards).toHaveLength(3);
  });

  it("rent payment with property cards goes to collector's properties", () => {
    let s = createTestGame();
    s.players[0].hand.push({
      id: "dc1", type: CardType.ActionDebtCollector,
      name: "Debt Collector", bankValue: 3, actionValue: 5,
    });
    s.players[2].bank = []; // P3 has no bank — must pay with properties

    s = ok(applyAction(s, {
      type: ActionType.PlayDebtCollector, playerId: "p1",
      cardId: "dc1", targetPlayerId: "p3",
    }));
    expect(s.pendingAction!.amount).toBe(5);

    // P3 pays with indiana($3) + illinois($3) = $6 ≥ $5
    s = ok(applyAction(s, {
      type: ActionType.PayWithCards, playerId: "p3",
      cardIds: ["indiana", "illinois"],
    }));

    // Both Red properties transferred to P1
    const p1Red = s.players[0].properties.find(g => g.color === PropertyColor.Red);
    expect(p1Red).toBeDefined();
    expect(p1Red!.cards.map(c => c.id).sort()).toEqual(["illinois", "indiana"]);
    // P3 lost entire Red group
    expect(s.players[2].properties.find(g => g.color === PropertyColor.Red)).toBeUndefined();
  });

  it("forced deal swaps properties between players", () => {
    let s = createTestGame();
    s.currentPlayerIndex = 2; // P3's turn
    // Move stcharles from P1's hand to P1's properties (Pink, incomplete)
    s.players[0].hand = s.players[0].hand.filter(c => c.id !== "stcharles");
    s.players[0].properties.push({
      color: PropertyColor.Pink,
      cards: [prop("stcharles", PropertyColor.Pink, "St. Charles Place", 2)],
      hasHouse: false, hasHotel: false,
    });

    // P3 offers indiana (Red 2/3 incomplete) for P1's stcharles (Pink 1/3 incomplete)
    s = ok(applyAction(s, {
      type: ActionType.PlayForcedDeal, playerId: "p3", cardId: "forceddeal1",
      targetPlayerId: "p1", offeredCardId: "indiana", requestedCardId: "stcharles",
    }));
    expect(s.phase).toBe(TurnPhase.AwaitingResponse);

    s = ok(applyAction(s, { type: ActionType.AcceptAction, playerId: "p1" }));

    // P3 got stcharles in Pink
    const p3Pink = s.players[2].properties.find(g => g.color === PropertyColor.Pink);
    expect(p3Pink!.cards[0].id).toBe("stcharles");
    // P1 got indiana in Red
    const p1Red = s.players[0].properties.find(g => g.color === PropertyColor.Red);
    expect(p1Red!.cards[0].id).toBe("indiana");
    // P3's Red lost indiana, only illinois remains
    const p3Red = s.players[2].properties.find(g => g.color === PropertyColor.Red);
    expect(p3Red!.cards).toHaveLength(1);
    expect(p3Red!.cards[0].id).toBe("illinois");
  });

  it("deal breaker steals complete set and triggers win", () => {
    let s = createTestGame();
    // Give P1 a deal breaker
    s.players[0].hand.push({
      id: "dealbrk_p1", type: CardType.ActionDealBreaker,
      name: "Deal Breaker", bankValue: 5,
    });
    // Complete P2's DarkBlue set
    s.players[1].properties[0].cards.push(
      prop("park", PropertyColor.DarkBlue, "Park Place", 4),
    );

    // P1 has Brown(2/2) + Utility(2/2). Stealing DarkBlue(2/2) = 3rd set → win.
    s = ok(applyAction(s, {
      type: ActionType.PlayDealBreaker, playerId: "p1", cardId: "dealbrk_p1",
      targetPlayerId: "p2", targetColor: PropertyColor.DarkBlue,
    }));
    expect(s.phase).toBe(TurnPhase.AwaitingResponse);

    s = ok(applyAction(s, { type: ActionType.AcceptAction, playerId: "p2" }));

    expect(s.phase).toBe(TurnPhase.GameOver);
    expect(s.winnerId).toBe("p1");
    // P1 has the stolen DarkBlue set
    const p1DB = s.players[0].properties.find(g => g.color === PropertyColor.DarkBlue);
    expect(p1DB!.cards).toHaveLength(2);
    // P2 lost it
    expect(s.players[1].properties.find(g => g.color === PropertyColor.DarkBlue)).toBeUndefined();
  });

  it("double rent + rent combo doubles the charge", () => {
    let s = createTestGame();
    s.currentPlayerIndex = 1; // P2's turn

    s = ok(applyAction(s, {
      type: ActionType.PlayDoubleRent, playerId: "p2", cardId: "dblrent1",
    }));
    expect(s.doubleRentActive).toBe(true);
    expect(s.actionsRemaining).toBe(2);

    // DarkBlue 1 card = $3M base, doubled = $6M
    s = ok(applyAction(s, {
      type: ActionType.PlayRentCard, playerId: "p2",
      cardId: "rent_db_g", targetColor: PropertyColor.DarkBlue,
    }));
    expect(s.pendingAction!.amount).toBe(6);
    expect(s.pendingAction!.isDoubled).toBe(true);
    expect(s.doubleRentActive).toBe(false);
  });

  it("birthday collects $2M from all other players", () => {
    let s = createTestGame();
    s.currentPlayerIndex = 2; // P3's turn
    // Give P2 bank money so both opponents can pay
    s.players[1].bank.push(money("m2_p2", 2));

    s = ok(applyAction(s, {
      type: ActionType.PlayBirthday, playerId: "p3", cardId: "bday1",
    }));
    expect(s.pendingAction!.type).toBe(PendingActionType.PayBirthday);
    expect(s.pendingAction!.amount).toBe(2);
    expect(s.pendingAction!.targetPlayerIds).toEqual(["p1", "p2"]);

    // P1 pays $10M from bank (overpayment)
    s = ok(applyAction(s, {
      type: ActionType.PayWithCards, playerId: "p1", cardIds: ["m10_p1"],
    }));
    // P2 pays $2M from bank
    s = ok(applyAction(s, {
      type: ActionType.PayWithCards, playerId: "p2", cardIds: ["m2_p2"],
    }));

    expect(s.phase).toBe(TurnPhase.Play);
    // P3 received both payments in bank
    const p3Bank = s.players[2].bank;
    expect(p3Bank.some(c => c.id === "m10_p1")).toBe(true);
    expect(p3Bank.some(c => c.id === "m2_p2")).toBe(true);
  });

  it("discard phase triggers when hand exceeds 7 after all actions used", () => {
    let s = createTestGame();
    // P1 starts with 7 cards. Add 4 extras → 11 total.
    for (let i = 1; i <= 4; i++) {
      s.players[0].hand.push(money(`extra${i}`, 1));
    }

    // Use all 3 actions banking money → hand = 11 - 3 = 8 > 7
    s = ok(applyAction(s, { type: ActionType.PlayMoneyToBank, playerId: "p1", cardId: "m1_p1" }));
    s = ok(applyAction(s, { type: ActionType.PlayMoneyToBank, playerId: "p1", cardId: "m5_p1" }));
    s = ok(applyAction(s, { type: ActionType.PlayMoneyToBank, playerId: "p1", cardId: "extra1" }));

    expect(s.phase).toBe(TurnPhase.Discard);
    expect(s.players[0].hand).toHaveLength(8);

    // Must discard exactly 1 card (8 - 7 = 1)
    s = ok(applyAction(s, {
      type: ActionType.DiscardCards, playerId: "p1", cardIds: ["extra2"],
    }));

    // Advances to P2's turn
    expect(s.phase).toBe(TurnPhase.Play);
    expect(s.currentPlayerIndex).toBe(1);
    expect(s.players[0].hand).toHaveLength(7);
  });

  it("insufficient funds: player pays everything they have", () => {
    let s = createTestGame();
    s.players[0].hand.push({
      id: "dc1", type: CardType.ActionDebtCollector,
      name: "Debt Collector", bankValue: 3, actionValue: 5,
    });
    // P3 has only $2M in bank, no properties → can't cover $5M debt
    s.players[2].bank = [money("m2_only", 2)];
    s.players[2].properties = [];

    s = ok(applyAction(s, {
      type: ActionType.PlayDebtCollector, playerId: "p1",
      cardId: "dc1", targetPlayerId: "p3",
    }));

    // P3 pays $2M — all they have. Engine accepts because canPayAnything is false after.
    s = ok(applyAction(s, {
      type: ActionType.PayWithCards, playerId: "p3", cardIds: ["m2_only"],
    }));

    expect(s.players[2].bank).toHaveLength(0);
    expect(s.players[2].properties).toHaveLength(0);
    expect(s.players[0].bank.some(c => c.id === "m2_only")).toBe(true);
  });
});
