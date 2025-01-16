import { Core } from "src/struct/Core";
import { Vec3 } from "vec3";
import { goals, Movements } from "mineflayer-pathfinder";
import { Result } from "bargs";

const ATTACK_RANGE = 3.8;
const SPRINT_RANGE = 6;
const PATHFIND_RANGE = 100;
const UPDATE_INTERVAL = 250;

const SWORD_PRIORITIES = [
  "diamond_sword",
  "iron_sword", 
  "stone_sword",
  "golden_sword",
  "wooden_sword"
];

interface Target {
  name: string;
  lastKnownPos: Vec3 | null;
}

interface ManhuntState {
  targets: Map<string, Target>;
  isHunting: boolean;
  updateInterval: NodeJS.Timeout | null;
  currentTarget: string | null;
  pvpEnabled: boolean;
}

const state: ManhuntState = {
  targets: new Map(),
  isHunting: false,
  updateInterval: null,
  currentTarget: null,
  pvpEnabled: false
};

async function equipBestSword(manager: Core): Promise<boolean> {
  const inventory = manager.bot.inventory.items();
  
  // Find best available sword
  for (const swordType of SWORD_PRIORITIES) {
    const sword = inventory.find(item => item.name === swordType);
    if (sword) {
      try {
        // Only equip if not already holding this sword
        if (!manager.bot.heldItem || manager.bot.heldItem.name !== sword.name) {
          await manager.bot.equip(sword, "hand");
        }
        return true;
      } catch (err) {
        manager.logger.error(`Failed to equip ${swordType}:`, err);
      }
    }
  }
  return false;
}

async function startHunting(manager: Core, targetName: string) {
  const targetPlayer = manager.bot.players[targetName];
  if (!targetPlayer?.entity) {
    manager.bot.chat(manager.i18n.get(manager.language, "commands", "manhunt.target_not_found", { target: targetName }) as string);
    return;
  }

  state.targets.set(targetName, {
    name: targetName,
    lastKnownPos: targetPlayer.entity.position.clone()
  });

  if (!state.isHunting) {
    state.isHunting = true;
    state.pvpEnabled = true;
    state.updateInterval = setInterval(() => updateHunt(manager), UPDATE_INTERVAL);
  }

  manager.bot.chat(manager.i18n.get(manager.language, "commands", "manhunt.target_added", { target: targetName, count: state.targets.size.toString() }) as string);
}

async function stopHunting(manager: Core, targetName?: string) {
  if (!state.isHunting) {
    manager.bot.chat(manager.i18n.get(manager.language, "commands", "manhunt.not_hunting") as string);
    return;
  }

  if (targetName) {
    if (state.targets.has(targetName)) {
      state.targets.delete(targetName);
      manager.bot.chat(manager.i18n.get(manager.language, "commands", "manhunt.target_removed", { target: targetName, count: state.targets.size.toString() }) as string);

      if (state.targets.size === 0) {
        await stopHuntingCompletely(manager);
      }
    } else {
      manager.bot.chat(manager.i18n.get(manager.language, "commands", "manhunt.not_hunting_target", { target: targetName }) as string);
    }
  } else {
    await stopHuntingCompletely(manager);
  }
}

async function stopHuntingCompletely(manager: Core) {
  // Stop all movement states
  manager.bot.clearControlStates();
  manager.bot.setControlState("forward", false);
  manager.bot.setControlState("sprint", false);
  manager.bot.setControlState("jump", false);
  manager.bot.pathfinder.setGoal(null);

  state.pvpEnabled = false;
  if (manager.bot.pvp) {
    manager.bot.pvp.target = undefined;
  }

  if (state.updateInterval) {
    clearInterval(state.updateInterval);
  }

  state.targets.clear();
  state.isHunting = false;
  state.updateInterval = null;
  state.currentTarget = null;

  manager.bot.chat(manager.i18n.get(manager.language, "commands", "manhunt.stopped_all") as string);
}

async function updateHunt(manager: Core) {
  if (!state.isHunting || !state.pvpEnabled || state.targets.size === 0) return;

  const closestTarget = findBestTarget(manager);
  if (!closestTarget) {
    manager.bot.chat(manager.i18n.get(manager.language, "commands", "manhunt.no_valid_targets") as string);
    return;
  }

  state.currentTarget = closestTarget.name;
  const targetPlayer = manager.bot.players[closestTarget.name];

  if (!targetPlayer?.entity) {
    manager.bot.chat(manager.i18n.get(manager.language, "commands", "manhunt.lost_sight", { target: closestTarget.name }) as string);
    state.targets.get(closestTarget.name)!.lastKnownPos = null;
    return;
  }

  const target = state.targets.get(closestTarget.name)!;
  target.lastKnownPos = targetPlayer.entity.position.clone();
  const distance = manager.bot.entity.position.distanceTo(target.lastKnownPos);

  try {
    if (distance <= ATTACK_RANGE && state.pvpEnabled) {
      // Try to equip best sword before attacking
      await equipBestSword(manager);
      
      await manager.bot.lookAt(targetPlayer.entity.position.offset(0, 1.6, 0));
      if (manager.bot.pvp) {
        manager.bot.pvp.attack(targetPlayer.entity);
      } else {
        manager.bot.attack(targetPlayer.entity);
      }
    } else if (distance <= SPRINT_RANGE) {
      // Enable sprinting and jumping for faster movement
      manager.bot.setControlState("sprint", true);
      manager.bot.setControlState("forward", true);
      manager.bot.setControlState("jump", true);
      await manager.bot.lookAt(targetPlayer.entity.position.offset(0, 1.6, 0));
    } else if (distance <= PATHFIND_RANGE) {
      // Disable manual controls when using pathfinder
      manager.bot.clearControlStates();
      const mcData = require('minecraft-data')(manager.bot.version);
      const movements = new Movements(manager.bot);
      movements.canDig = false;  // Don't dig blocks while chasing
      movements.allowSprinting = true;  // Allow sprinting in pathfinding
      manager.bot.pathfinder.setMovements(movements);
      
      const goal = new goals.GoalNear(
        target.lastKnownPos.x,
        target.lastKnownPos.y,
        target.lastKnownPos.z,
        2
      );
      manager.bot.pathfinder.setGoal(goal);
    } else {
      manager.bot.chat(manager.i18n.get(manager.language, "commands", "manhunt.target_too_far", { target: closestTarget.name }) as string);
      target.lastKnownPos = null;
    }
  } catch (err) {
    manager.bot.chat(manager.i18n.get(manager.language, "commands", "manhunt.error_hunting", { target: closestTarget.name, error: String(err) }) as string);
  }
}

function findBestTarget(manager: Core): Target | null {
  let closestTarget: Target | null = null;
  let closestDistance = Infinity;

  for (const target of state.targets.values()) {
    const player = manager.bot.players[target.name];
    if (!player?.entity) continue;

    const distance = manager.bot.entity.position.distanceTo(player.entity.position);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestTarget = target;
    }
  }

  return closestTarget;
}

const ManhuntCommand: Bot.Command = {
  name: "manhunt",
  aliases: [],
  args_definitions: [
    {
      name: "action",
      type: String,
      default: true
    }
  ],
  master_only: true,
  execute: async ({ manager, args, message }: { manager: Core, args: Result, message: string }) => {
    const parts = message.split(" ").slice(1);
    const action = parts[0]?.toLowerCase();
    const target = parts[1];

    if (!action) {
      manager.bot.chat(manager.i18n.get(manager.language, "commands", "manhunt.specify_action") as string);
      return;
    }

    if (action === "start") {
      if (!target) {
        manager.bot.chat(manager.i18n.get(manager.language, "commands", "manhunt.specify_player") as string);
        return;
      }
      await startHunting(manager, target);
    } else if (action === "stop") {
      await stopHunting(manager, target);
    } else if (action === "list") {
      const targets = Array.from(state.targets.keys());
      if (targets.length === 0) {
        manager.bot.chat(manager.i18n.get(manager.language, "commands", "manhunt.not_hunting") as string);
      } else {
        manager.bot.chat(manager.i18n.get(manager.language, "commands", "manhunt.current_targets", { count: targets.length.toString(), targets: targets.join(", ") }) as string);
        if (state.currentTarget) {
          manager.bot.chat(manager.i18n.get(manager.language, "commands", "manhunt.current_focus", { target: state.currentTarget }) as string);
        }
      }
    } else {
      manager.bot.chat(manager.i18n.get(manager.language, "commands", "manhunt.invalid_action") as string);
    }
  },
};

export default ManhuntCommand; 