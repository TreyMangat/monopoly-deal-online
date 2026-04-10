// ============================================================
// MONOPOLY DEAL ONLINE — Card Definitions
// ============================================================
// All 110 cards in a standard Monopoly Deal deck.
// For 6 players, we shuffle two copies together (220 cards).
// The 4 "Quick Start Rules" cards are excluded (not gameplay).
// That leaves 106 playable cards per deck.
// ============================================================

import { Card, CardType, PropertyColor } from "./types";

// ---- Helper to build cards ----

let _idCounter = 0;
function makeId(prefix: string): string {
  _idCounter++;
  return `${prefix}_${_idCounter}`;
}

// ---- MONEY CARDS (20) ----

function moneyCard(value: number): Card {
  return {
    id: makeId(`money_${value}m`),
    type: CardType.Money,
    name: `$${value}M`,
    bankValue: value,
  };
}

function buildMoneyCards(): Card[] {
  const cards: Card[] = [];
  // 6x $1M, 5x $2M, 3x $3M, 3x $4M, 2x $5M, 1x $10M
  for (let i = 0; i < 6; i++) cards.push(moneyCard(1));
  for (let i = 0; i < 5; i++) cards.push(moneyCard(2));
  for (let i = 0; i < 3; i++) cards.push(moneyCard(3));
  for (let i = 0; i < 3; i++) cards.push(moneyCard(4));
  for (let i = 0; i < 2; i++) cards.push(moneyCard(5));
  cards.push(moneyCard(10));
  return cards;
}

// ---- PROPERTY CARDS (28) ----

const PROPERTY_NAMES: Record<PropertyColor, string[]> = {
  [PropertyColor.Brown]: ["Mediterranean Avenue", "Baltic Avenue"],
  [PropertyColor.LightBlue]: [
    "Oriental Avenue",
    "Vermont Avenue",
    "Connecticut Avenue",
  ],
  [PropertyColor.Pink]: [
    "St. Charles Place",
    "States Avenue",
    "Virginia Avenue",
  ],
  [PropertyColor.Orange]: [
    "St. James Place",
    "Tennessee Avenue",
    "New York Avenue",
  ],
  [PropertyColor.Red]: [
    "Kentucky Avenue",
    "Indiana Avenue",
    "Illinois Avenue",
  ],
  [PropertyColor.Yellow]: [
    "Atlantic Avenue",
    "Ventnor Avenue",
    "Marvin Gardens",
  ],
  [PropertyColor.Green]: [
    "Pacific Avenue",
    "North Carolina Avenue",
    "Pennsylvania Avenue",
  ],
  [PropertyColor.DarkBlue]: ["Park Place", "Boardwalk"],
  [PropertyColor.Railroad]: [
    "Reading Railroad",
    "Pennsylvania Railroad",
    "B&O Railroad",
    "Short Line",
  ],
  [PropertyColor.Utility]: ["Electric Company", "Water Works"],
};

// Bank value of each property card by color
const PROPERTY_BANK_VALUES: Record<PropertyColor, number> = {
  [PropertyColor.Brown]: 1,
  [PropertyColor.LightBlue]: 1,
  [PropertyColor.Pink]: 2,
  [PropertyColor.Orange]: 2,
  [PropertyColor.Red]: 3,
  [PropertyColor.Yellow]: 3,
  [PropertyColor.Green]: 4,
  [PropertyColor.DarkBlue]: 4,
  [PropertyColor.Railroad]: 2,
  [PropertyColor.Utility]: 2,
};

function buildPropertyCards(): Card[] {
  const cards: Card[] = [];
  for (const color of Object.values(PropertyColor)) {
    const names = PROPERTY_NAMES[color];
    for (const name of names) {
      cards.push({
        id: makeId(`prop_${color}`),
        type: CardType.Property,
        name,
        bankValue: PROPERTY_BANK_VALUES[color],
        color,
      });
    }
  }
  return cards;
}

// ---- PROPERTY WILD CARDS (11) ----
// 9 two-color wilds + 2 rainbow (all-color) wilds

interface WildDef {
  color: PropertyColor;
  altColor: PropertyColor;
  bankValue: number;
  count: number;
}

const TWO_COLOR_WILDS: WildDef[] = [
  {
    color: PropertyColor.DarkBlue,
    altColor: PropertyColor.Green,
    bankValue: 4,
    count: 1,
  },
  {
    color: PropertyColor.Green,
    altColor: PropertyColor.Railroad,
    bankValue: 4,
    count: 1,
  },
  {
    color: PropertyColor.Utility,
    altColor: PropertyColor.Railroad,
    bankValue: 2,
    count: 1,
  },
  {
    color: PropertyColor.LightBlue,
    altColor: PropertyColor.Railroad,
    bankValue: 4,
    count: 1,
  },
  {
    color: PropertyColor.LightBlue,
    altColor: PropertyColor.Brown,
    bankValue: 1,
    count: 1,
  },
  {
    color: PropertyColor.Pink,
    altColor: PropertyColor.Orange,
    bankValue: 2,
    count: 2,
  },
  {
    color: PropertyColor.Red,
    altColor: PropertyColor.Yellow,
    bankValue: 3,
    count: 2,
  },
];

function buildPropertyWildCards(): Card[] {
  const cards: Card[] = [];

  for (const def of TWO_COLOR_WILDS) {
    for (let i = 0; i < def.count; i++) {
      cards.push({
        id: makeId(`wild_${def.color}_${def.altColor}`),
        type: CardType.PropertyWild,
        name: `Wild ${def.color}/${def.altColor}`,
        bankValue: def.bankValue,
        color: def.color,
        altColor: def.altColor,
      });
    }
  }

  // 2 rainbow (all-color) wild property cards
  for (let i = 0; i < 2; i++) {
    cards.push({
      id: makeId("wild_all"),
      type: CardType.PropertyWildAll,
      name: "Wild Property",
      bankValue: 0, // rainbow wilds have $0 bank value
    });
  }

  return cards;
}

// ---- ACTION CARDS (34) ----

function buildActionCards(): Card[] {
  const cards: Card[] = [];

  // 10x Pass Go ($1M bank value)
  for (let i = 0; i < 10; i++) {
    cards.push({
      id: makeId("pass_go"),
      type: CardType.ActionPassGo,
      name: "Pass Go",
      bankValue: 1,
    });
  }

  // 3x Debt Collector ($3M bank value, charges $5M)
  for (let i = 0; i < 3; i++) {
    cards.push({
      id: makeId("debt_collector"),
      type: CardType.ActionDebtCollector,
      name: "Debt Collector",
      bankValue: 3,
      actionValue: 5,
    });
  }

  // 3x It's My Birthday ($2M bank value, charges $2M to ALL players)
  for (let i = 0; i < 3; i++) {
    cards.push({
      id: makeId("birthday"),
      type: CardType.ActionItsMyBirthday,
      name: "It's My Birthday",
      bankValue: 2,
      actionValue: 2,
    });
  }

  // 3x Forced Deal ($3M bank value)
  for (let i = 0; i < 3; i++) {
    cards.push({
      id: makeId("forced_deal"),
      type: CardType.ActionForcedDeal,
      name: "Forced Deal",
      bankValue: 3,
    });
  }

  // 3x Sly Deal ($3M bank value)
  for (let i = 0; i < 3; i++) {
    cards.push({
      id: makeId("sly_deal"),
      type: CardType.ActionSlyDeal,
      name: "Sly Deal",
      bankValue: 3,
    });
  }

  // 2x Deal Breaker ($5M bank value)
  for (let i = 0; i < 2; i++) {
    cards.push({
      id: makeId("deal_breaker"),
      type: CardType.ActionDealBreaker,
      name: "Deal Breaker",
      bankValue: 5,
    });
  }

  // 3x Just Say No ($4M bank value)
  for (let i = 0; i < 3; i++) {
    cards.push({
      id: makeId("just_say_no"),
      type: CardType.ActionJustSayNo,
      name: "Just Say No",
      bankValue: 4,
    });
  }

  // 2x Double the Rent ($1M bank value)
  for (let i = 0; i < 2; i++) {
    cards.push({
      id: makeId("double_rent"),
      type: CardType.ActionDoubleRent,
      name: "Double the Rent",
      bankValue: 1,
    });
  }

  // 3x House ($3M bank value, adds $3M rent)
  for (let i = 0; i < 3; i++) {
    cards.push({
      id: makeId("house"),
      type: CardType.ActionHouse,
      name: "House",
      bankValue: 3,
      actionValue: 3,
    });
  }

  // 2x Hotel ($4M bank value, adds $4M rent)
  for (let i = 0; i < 2; i++) {
    cards.push({
      id: makeId("hotel"),
      type: CardType.ActionHotel,
      name: "Hotel",
      bankValue: 4,
      actionValue: 4,
    });
  }

  return cards;
}

// ---- RENT CARDS (13) ----

function buildRentCards(): Card[] {
  const cards: Card[] = [];

  // 2x Dark Blue / Green ($1M)
  for (let i = 0; i < 2; i++) {
    cards.push({
      id: makeId("rent_darkblue_green"),
      type: CardType.RentTwoColor,
      name: "Rent: Dark Blue / Green",
      bankValue: 1,
      rentColors: [PropertyColor.DarkBlue, PropertyColor.Green],
    });
  }

  // 2x Red / Yellow ($1M)
  for (let i = 0; i < 2; i++) {
    cards.push({
      id: makeId("rent_red_yellow"),
      type: CardType.RentTwoColor,
      name: "Rent: Red / Yellow",
      bankValue: 1,
      rentColors: [PropertyColor.Red, PropertyColor.Yellow],
    });
  }

  // 2x Pink / Orange ($1M)
  for (let i = 0; i < 2; i++) {
    cards.push({
      id: makeId("rent_pink_orange"),
      type: CardType.RentTwoColor,
      name: "Rent: Pink / Orange",
      bankValue: 1,
      rentColors: [PropertyColor.Pink, PropertyColor.Orange],
    });
  }

  // 2x Light Blue / Brown ($1M)
  for (let i = 0; i < 2; i++) {
    cards.push({
      id: makeId("rent_lightblue_brown"),
      type: CardType.RentTwoColor,
      name: "Rent: Light Blue / Brown",
      bankValue: 1,
      rentColors: [PropertyColor.LightBlue, PropertyColor.Brown],
    });
  }

  // 2x Railroad / Utility ($1M)
  for (let i = 0; i < 2; i++) {
    cards.push({
      id: makeId("rent_railroad_utility"),
      type: CardType.RentTwoColor,
      name: "Rent: Railroad / Utility",
      bankValue: 1,
      rentColors: [PropertyColor.Railroad, PropertyColor.Utility],
    });
  }

  // 3x Wild Rent (any color, $3M bank value)
  for (let i = 0; i < 3; i++) {
    cards.push({
      id: makeId("rent_wild"),
      type: CardType.RentWild,
      name: "Rent: Any Color",
      bankValue: 3,
    });
  }

  return cards;
}

// ---- BUILD FULL DECK ----

export function buildDeck(doubleDeck: boolean = false): Card[] {
  // Reset ID counter for deterministic IDs
  _idCounter = 0;

  const singleDeck: Card[] = [
    ...buildMoneyCards(),
    ...buildPropertyCards(),
    ...buildPropertyWildCards(),
    ...buildActionCards(),
    ...buildRentCards(),
  ];

  if (doubleDeck) {
    // For 6 players: two full decks shuffled together
    // Second deck gets "_d2" suffix on IDs
    const secondDeck = singleDeck.map((card) => ({
      ...card,
      id: card.id + "_d2",
    }));
    return [...singleDeck, ...secondDeck];
  }

  return singleDeck;
}

// ---- DECK STATS (for validation) ----

export function getDeckStats(deck: Card[]) {
  const stats = {
    total: deck.length,
    money: deck.filter((c) => c.type === CardType.Money).length,
    property: deck.filter((c) => c.type === CardType.Property).length,
    propertyWild: deck.filter(
      (c) =>
        c.type === CardType.PropertyWild || c.type === CardType.PropertyWildAll
    ).length,
    action: deck.filter((c) =>
      [
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
      ].includes(c.type)
    ).length,
    rent: deck.filter(
      (c) => c.type === CardType.RentTwoColor || c.type === CardType.RentWild
    ).length,
  };
  return stats;
}
