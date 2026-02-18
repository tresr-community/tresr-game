import Phaser from "phaser";
import type {GameplayConfig} from "@/lib/game/scenes/MainScene";
import {gameActions, gameState} from "@/lib/game/state";

export class UIManager {
  // Change detection cache (ticket #162, #200: avoid per-frame thrashing)
  private lastReportedHp: number = 0;
  private lastReportedBossHp: number = 0;
  private lastReportedScore: number = 0;
  private lastReportedKeys: number = 0;

  constructor(
    private scene: Phaser.Scene,
    private config: GameplayConfig,
    private addAdHocTimer: (timer: Phaser.Time.TimerEvent) => void
  ) {}

  /** Push current survival timer value to the store for HUD display. */
  updateTimerStatus(survivalTimer: number) {
    gameActions.setTimer(survivalTimer);
  }

  /**
   * 3-2-1 countdown before gameplay starts.
   * Each number scales in then fades, followed by a "BEAR MARKET" announcement.
   */
  showCountdown(onComplete: () => void) {
    const {width, height} = this.scene.cameras.main;
    const ann = this.config.announcements;

    const numbers = ["3", "2", "1"];
    let index = 0;

    const showNext = () => {
      if (index >= numbers.length) {
        this.showPhaseAnnouncement("BEAR MARKET");
        onComplete();
        return;
      }

      // Responsive font: match showPhaseAnnouncement scaling
      const fontSize = Math.min(80, Math.floor(width / 8));
      const strokeThickness = Math.max(
        2,
        Math.round(ann.stroke_thickness * (fontSize / 80))
      );

      const numText = this.scene.add
        .text(width / 2, height / 2, numbers[index], {
          font: `${fontSize}px Orbitron`,
          color: ann.color,
          stroke: ann.stroke_color,
          strokeThickness,
        })
        .setOrigin(0.5)
        .setDepth(1000)
        .setScale(3)
        .setAlpha(1);

      // Play countdown SFX
      try {
        this.scene.sound.play("countdown_1", {
          volume: gameState.get().music.sfxVolume,
        });
      } catch {
        // SFX may not be ready yet
      }

      // Each beat lasts 1 second: tween animates out over 800ms,
      // then a 200ms gap before the next number starts.
      this.scene.tweens.add({
        targets: numText,
        scale: 1,
        alpha: 0,
        duration: 800,
        ease: "Power2",
        onComplete: () => {
          numText.destroy();
          index++;
          this.addAdHocTimer(this.scene.time.delayedCall(200, showNext));
        },
      });
    };

    // Start countdown after a brief delay to let fade-in start
    this.addAdHocTimer(this.scene.time.delayedCall(400, showNext));
  }

  /** Display a large phase announcement text with scale+fade animation. */
  showPhaseAnnouncement(text: string) {
    const {width, height} = this.scene.cameras.main;
    const ann = this.config.announcements;

    // Responsive font: cap at config size but scale down for smaller screens
    const fontSize = Math.min(80, Math.floor(width / 8));
    const strokeThickness = Math.max(
      2,
      Math.round(ann.stroke_thickness * (fontSize / 80))
    );

    const overlay = this.scene.add
      .text(width / 2, height / 2, text, {
        font: `${fontSize}px Orbitron`,
        color: ann.color,
        stroke: ann.stroke_color,
        strokeThickness,
      })
      .setOrigin(0.5)
      .setDepth(1000)
      .setAlpha(0)
      .setScale(0.5);

    if (text === "DEFEAT" || text === "SYSTEM CRITICAL") {
      overlay.setColor("#ff0000");
    } else if (text === "BOSS PHASE") {
      overlay.setColor("#ffaa00");
    }

    this.scene.tweens.add({
      targets: overlay,
      alpha: 1,
      scale: 1,
      duration: ann.enter_duration,
      ease: "Back.easeOut",
      onComplete: () => {
        this.addAdHocTimer(
          this.scene.time.delayedCall(ann.display_duration, () => {
            this.scene.tweens.add({
              targets: overlay,
              alpha: 0,
              scale: 1.5,
              duration: ann.exit_duration,
              onComplete: () => overlay.destroy(),
            });
          })
        );
      },
    });
  }

  /**
   * Sync game state values to the store for HUD display.
   * Uses change detection to avoid per-frame thrashing (ticket #162, #200).
   */
  syncState(
    score: number,
    collectedKeys: number,
    playerHp?: number,
    bossHp?: number
  ) {
    if (playerHp !== undefined && playerHp !== this.lastReportedHp) {
      gameActions.setHp(playerHp);
      this.lastReportedHp = playerHp;
    }
    if (bossHp !== undefined && bossHp !== this.lastReportedBossHp) {
      gameActions.setBossHp(bossHp);
      this.lastReportedBossHp = bossHp;
    }
    if (score !== this.lastReportedScore) {
      gameActions.setScore(score);
      this.lastReportedScore = score;
    }
    if (collectedKeys !== this.lastReportedKeys) {
      gameActions.setKeys(collectedKeys);
      this.lastReportedKeys = collectedKeys;
    }
  }

  shutdown() {
    this.lastReportedHp = 0;
    this.lastReportedBossHp = 0;
    this.lastReportedScore = 0;
    this.lastReportedKeys = 0;
  }
}
