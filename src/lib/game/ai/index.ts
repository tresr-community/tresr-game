import type Phaser from "phaser";
import type {AIBehavior, EnemyAIType} from "./types";
import type {ConfigTypes} from "@/types/config";
import {DirectBehavior} from "./direct";
import {FlankerBehavior} from "./flanker";
import {CautiousBehavior} from "./cautious";
import {ErraticBehavior} from "./erratic";
import {SwarmBehavior} from "./swarm";
import {PassiveBehavior} from "./passive";
import {RetardioBehavior} from "./retardio";

export type {
  AIBehavior,
  EnemyAIType,
  EnemyContext,
  BehaviorResult,
} from "./types";
export type {GroupMemberView} from "./types";

/** Create a fresh AIBehavior instance for the given type. */
export function createBehavior(aiType: EnemyAIType): AIBehavior {
  switch (aiType) {
    case "direct":
      return new DirectBehavior();
    case "flanker":
      return new FlankerBehavior();
    case "cautious":
      return new CautiousBehavior();
    case "erratic":
      return new ErraticBehavior();
    case "swarm":
      return new SwarmBehavior();
    case "passive":
      return new PassiveBehavior();
    case "retardio":
      return new RetardioBehavior();
  }
}

/**
 * Weighted random selection of an AI type from config weights.
 * Falls back to "direct" when total weight is zero.
 */
export function selectRandomAIType(
  config: ConfigTypes,
  rng: Phaser.Math.RandomDataGenerator
): EnemyAIType {
  const weights = config.gameplay.entities.enemy.ai.weights;
  const entries: [EnemyAIType, number][] = [
    ["direct", weights.direct],
    ["flanker", weights.flanker],
    ["cautious", weights.cautious],
    ["erratic", weights.erratic],
    ["swarm", weights.swarm],
    ["passive", weights.passive],
    ["retardio", weights.retardio],
  ];

  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  if (totalWeight <= 0) return "direct";

  let roll = rng.frac() * totalWeight;
  for (const [type, w] of entries) {
    roll -= w;
    if (roll <= 0) return type;
  }

  return "direct"; // fallback
}
