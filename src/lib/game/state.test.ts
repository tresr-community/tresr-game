import {describe, expect, test, beforeEach} from "bun:test";
import {gameActions, gameState} from "./state";

describe("GameStateManager", () => {
  beforeEach(() => {
    gameActions.reset();
  });

  describe("initial state", () => {
    test("has correct defaults", () => {
      const state = gameState.get();
      expect(state.hp).toBe(0);
      expect(state.lives).toBe(1);
      expect(state.score).toBe(0);
      expect(state.keys).toBe(0);
      expect(state.timer).toBe(0);
      expect(state.enemiesKilled).toBe(0);
      expect(state.phase).toBe("survival");
      expect(state.isPaused).toBe(false);
      expect(state.isSaving).toBe(false);
      expect(state.configTampered).toBe(false);
      expect(state.superCharge).toBe(0);
      expect(state.bossHp).toBe(0);
      expect(state.bossMaxHp).toBe(0);
    });

    test("has correct music defaults", () => {
      const music = gameState.get().music;
      expect(music.isPlaying).toBe(false);
      expect(music.currentTrack).toBe("");
      expect(music.favoriteTrack).toBe("");
      expect(music.playbackMode).toBe("shuffle");
      expect(music.musicVolume).toBe(0);
      expect(music.sfxVolume).toBe(0);
      expect(music.currentTime).toBe(0);
      expect(music.duration).toBe(0);
    });
  });

  describe("setHp", () => {
    test("sets HP correctly", () => {
      gameActions.setHp(100);
      expect(gameState.get().hp).toBe(100);
    });

    test("clamps negative HP to 0", () => {
      gameActions.setHp(-50);
      expect(gameState.get().hp).toBe(0);
    });
  });

  describe("setLives", () => {
    test("sets lives correctly", () => {
      gameActions.setLives(3);
      expect(gameState.get().lives).toBe(3);
    });

    test("clamps negative lives to 0", () => {
      gameActions.setLives(-1);
      expect(gameState.get().lives).toBe(0);
    });
  });

  describe("decrementLives", () => {
    test("decrements lives by 1", () => {
      gameActions.setLives(3);
      gameActions.decrementLives();
      expect(gameState.get().lives).toBe(2);
    });

    test("does not go below 0", () => {
      gameActions.setLives(0);
      gameActions.decrementLives();
      expect(gameState.get().lives).toBe(0);
    });
  });

  describe("score", () => {
    test("setScore sets score", () => {
      gameActions.setScore(500);
      expect(gameState.get().score).toBe(500);
    });

    test("setScore clamps negative to 0", () => {
      gameActions.setScore(-100);
      expect(gameState.get().score).toBe(0);
    });

    test("addScore adds to current score", () => {
      gameActions.setScore(100);
      gameActions.addScore(50);
      expect(gameState.get().score).toBe(150);
    });

    test("addScore clamps to 0 on negative result", () => {
      gameActions.setScore(10);
      gameActions.addScore(-100);
      expect(gameState.get().score).toBe(0);
    });
  });

  describe("keys", () => {
    test("setKeys sets key count", () => {
      gameActions.setKeys(5);
      expect(gameState.get().keys).toBe(5);
    });

    test("setKeys clamps negative to 0", () => {
      gameActions.setKeys(-1);
      expect(gameState.get().keys).toBe(0);
    });

    test("collectKey increments by 1", () => {
      gameActions.collectKey();
      gameActions.collectKey();
      expect(gameState.get().keys).toBe(2);
    });
  });

  describe("timer", () => {
    test("setTimer sets timer value", () => {
      gameActions.setTimer(300);
      expect(gameState.get().timer).toBe(300);
    });

    test("setTimer clamps negative to 0", () => {
      gameActions.setTimer(-10);
      expect(gameState.get().timer).toBe(0);
    });
  });

  describe("phase", () => {
    test("setPhase changes game phase", () => {
      gameActions.setPhase("boss");
      expect(gameState.get().phase).toBe("boss");
    });

    test("can transition through all phases", () => {
      const phases = ["survival", "boss", "victory", "lost"] as const;
      for (const phase of phases) {
        gameActions.setPhase(phase);
        expect(gameState.get().phase).toBe(phase);
      }
    });
  });

  describe("pause", () => {
    test("togglePause flips pause state", () => {
      expect(gameState.get().isPaused).toBe(false);
      gameActions.togglePause();
      expect(gameState.get().isPaused).toBe(true);
      gameActions.togglePause();
      expect(gameState.get().isPaused).toBe(false);
    });

    test("setPaused sets directly", () => {
      gameActions.setPaused(true);
      expect(gameState.get().isPaused).toBe(true);
      gameActions.setPaused(false);
      expect(gameState.get().isPaused).toBe(false);
    });
  });

  describe("isSaving", () => {
    test("defaults to false", () => {
      expect(gameState.get().isSaving).toBe(false);
    });

    test("setSaving(true) sets it to true", () => {
      gameActions.setSaving(true);
      expect(gameState.get().isSaving).toBe(true);
    });

    test("setSaving(false) sets it back to false", () => {
      gameActions.setSaving(true);
      gameActions.setSaving(false);
      expect(gameState.get().isSaving).toBe(false);
    });
  });

  describe("enemiesKilled", () => {
    test("incrementEnemiesKilled adds 1", () => {
      gameActions.incrementEnemiesKilled();
      gameActions.incrementEnemiesKilled();
      expect(gameState.get().enemiesKilled).toBe(2);
    });
  });

  describe("configTampered", () => {
    test("setConfigTampered is one-way", () => {
      gameActions.setConfigTampered();
      expect(gameState.get().configTampered).toBe(true);
    });
  });

  describe("superCharge", () => {
    test("setSuperCharge sets charge with default max", () => {
      gameActions.setSuperCharge(50);
      expect(gameState.get().superCharge).toBe(50);
    });

    test("setSuperCharge clamps to max", () => {
      gameActions.setSuperCharge(150, 100);
      expect(gameState.get().superCharge).toBe(100);
    });

    test("setSuperCharge clamps to 0", () => {
      gameActions.setSuperCharge(-10);
      expect(gameState.get().superCharge).toBe(0);
    });

    test("addSuperCharge adds to current", () => {
      gameActions.setSuperCharge(40, 100);
      gameActions.addSuperCharge(30, 100);
      expect(gameState.get().superCharge).toBe(70);
    });

    test("addSuperCharge clamps to max", () => {
      gameActions.setSuperCharge(90, 100);
      gameActions.addSuperCharge(20, 100);
      expect(gameState.get().superCharge).toBe(100);
    });

    test("resetSuperCharge sets to 0", () => {
      gameActions.setSuperCharge(80, 100);
      gameActions.resetSuperCharge();
      expect(gameState.get().superCharge).toBe(0);
    });

    test("attemptSuperAttack succeeds when charged", () => {
      gameActions.setSuperCharge(100, 100);
      const result = gameActions.attemptSuperAttack(100);
      expect(result).toBe(true);
      expect(gameState.get().superCharge).toBe(0);
    });

    test("attemptSuperAttack fails when not charged", () => {
      gameActions.setSuperCharge(50, 100);
      const result = gameActions.attemptSuperAttack(100);
      expect(result).toBe(false);
      expect(gameState.get().superCharge).toBe(50);
    });
  });

  describe("bossHp", () => {
    test("setBossHp sets HP", () => {
      gameActions.setBossHp(500);
      expect(gameState.get().bossHp).toBe(500);
    });

    test("setBossHp sets maxHp when provided", () => {
      gameActions.setBossHp(1000, 1000);
      expect(gameState.get().bossHp).toBe(1000);
      expect(gameState.get().bossMaxHp).toBe(1000);
    });

    test("setBossHp clamps negative to 0", () => {
      gameActions.setBossHp(-10);
      expect(gameState.get().bossHp).toBe(0);
    });
  });

  describe("music", () => {
    test("updateMusic merges partial state", () => {
      gameActions.updateMusic({isPlaying: true, currentTrack: "test"});
      const music = gameState.get().music;
      expect(music.isPlaying).toBe(true);
      expect(music.currentTrack).toBe("test");
      // Other fields unchanged
      expect(music.playbackMode).toBe("shuffle");
    });

    test("updateMusic preserves unset fields", () => {
      gameActions.updateMusic({musicVolume: 0.8});
      gameActions.updateMusic({sfxVolume: 0.5});
      const music = gameState.get().music;
      expect(music.musicVolume).toBe(0.8);
      expect(music.sfxVolume).toBe(0.5);
    });
  });

  describe("reset", () => {
    test("restores all values to initial state", () => {
      gameActions.setHp(100);
      gameActions.setScore(999);
      gameActions.setKeys(50);
      gameActions.setPhase("victory");
      gameActions.setPaused(true);
      gameActions.setSuperCharge(80, 100);
      gameActions.setBossHp(500, 1000);
      gameActions.incrementEnemiesKilled();

      gameActions.reset();

      const state = gameState.get();
      expect(state.hp).toBe(0);
      expect(state.score).toBe(0);
      expect(state.keys).toBe(0);
      expect(state.phase).toBe("survival");
      expect(state.isPaused).toBe(false);
      expect(state.isSaving).toBe(false);
      expect(state.superCharge).toBe(0);
      expect(state.bossHp).toBe(0);
      expect(state.bossMaxHp).toBe(0);
      expect(state.enemiesKilled).toBe(0);
    });

    test("reset during active game-over state", () => {
      gameActions.setPhase("lost");
      gameActions.setHp(0);
      gameActions.reset();
      expect(gameState.get().phase).toBe("survival");
      expect(gameState.get().hp).toBe(0);
    });
  });

  describe("subscriptions", () => {
    test("subscribe fires on state changes", () => {
      let callCount = 0;
      const unsub = gameState.subscribe(() => {
        callCount++;
      });
      gameActions.setHp(50);
      gameActions.setScore(100);
      // nanostores fires synchronously
      expect(callCount).toBeGreaterThanOrEqual(2);
      unsub();
    });

    test("get reflects latest mutations", () => {
      gameActions.setHp(75);
      gameActions.setScore(200);
      gameActions.setKeys(3);
      expect(gameState.get().hp).toBe(75);
      expect(gameState.get().score).toBe(200);
      expect(gameState.get().keys).toBe(3);
    });
  });
});
