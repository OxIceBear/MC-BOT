import { Core } from "src/struct/Core";
import { Result } from "bargs";
import { goals, Movements } from "mineflayer-pathfinder";
import { Vec3 } from "vec3";

const ATTACK_RANGE = 3;
const FOLLOW_RANGE = 2;
const MAX_ATTACK_RANGE = 16;
const LOW_HEALTH_THRESHOLD = 8;
const CRITICAL_HEALTH_THRESHOLD = 4;
const CIRCLE_RADIUS = 3;
const CIRCLE_POINTS = 8;
const CIRCLE_UPDATE_INTERVAL = 2000;

interface AttackState {
  isAttacking: boolean;
  updateInterval: NodeJS.Timeout | null;
  lastTarget: string | null;
  circlePosition: number;
  lastCircleUpdate: number;
}

const state: AttackState = {
  isAttacking: false,
  updateInterval: null,
  lastTarget: null,
  circlePosition: 0,
  lastCircleUpdate: 0
};

const WEAPON_PRIORITIES = [
  "netherite_sword",
  "diamond_sword",
  "iron_sword", 
  "stone_sword",
  "golden_sword",
  "wooden_sword",
  "netherite_axe",
  "diamond_axe",
  "iron_axe",
  "stone_axe",
  "golden_axe",
  "wooden_axe"
];

async function equipBestWeapon(manager: Core): Promise<boolean> {
  const inventory = manager.bot.inventory.items();
  
  for (const weaponType of WEAPON_PRIORITIES) {
    const weapon = inventory.find(item => item.name === weaponType);
    if (weapon) {
      try {
        if (!manager.bot.heldItem || manager.bot.heldItem.name !== weapon.name) {
          await manager.bot.equip(weapon, "hand");
        }
        return true;
      } catch (err) {
        manager.logger.error(`Failed to equip ${weaponType}:`, err);
      }
    }
  }
  return false;
}

async function equipTotem(manager: Core): Promise<boolean> {
  const inventory = manager.bot.inventory.items();
  const totem = inventory.find(item => item.name === "totem_of_undying");
  
  if (totem) {
    try {
      const offHandItem = manager.bot.inventory.slots[45];
      if (!offHandItem || offHandItem.name !== "totem_of_undying") {
        await manager.bot.equip(totem, "off-hand");
      }
      return true;
    } catch (err) {
      manager.logger.error("Failed to equip totem:", err);
    }
  }
  return false;
}

async function startAttacking(manager: Core) {
  if (state.isAttacking) {
    manager.bot.chat(manager.i18n.get(manager.language, "commands", "attack.already_attacking") as string);
    return;
  }

  const { master } = manager.getMaster();
  if (!master) {
    manager.bot.chat(manager.i18n.get(manager.language, "commands", "attack.no_master") as string);
    return;
  }

  state.isAttacking = true;
  state.updateInterval = setInterval(() => updateCombat(manager), 250);
  manager.bot.chat(manager.i18n.get(manager.language, "commands", "attack.started") as string);
}

async function stopAttacking(manager: Core) {
  if (!state.isAttacking) {
    manager.bot.chat(manager.i18n.get(manager.language, "commands", "attack.not_attacking") as string);
    return;
  }

  manager.bot.clearControlStates();
  if (manager.bot.pvp) {
    manager.bot.pvp.target = undefined;
  }
  
  if (state.updateInterval) {
    clearInterval(state.updateInterval);
  }

  state.isAttacking = false;
  state.updateInterval = null;
  state.lastTarget = null;

  manager.bot.chat(manager.i18n.get(manager.language, "commands", "attack.stopped") as string);
}

function getNextCirclePosition(masterPos: Vec3): Vec3 {
  const angle = (state.circlePosition * 2 * Math.PI) / CIRCLE_POINTS;
  const x = masterPos.x + CIRCLE_RADIUS * Math.cos(angle);
  const z = masterPos.z + CIRCLE_RADIUS * Math.sin(angle);
  
  return new Vec3(x, masterPos.y, z);
}

async function updateCirclePosition(manager: Core, masterPos: Vec3) {
  const now = Date.now();
  if (now - state.lastCircleUpdate >= CIRCLE_UPDATE_INTERVAL) {
    state.circlePosition = (state.circlePosition + 1) % CIRCLE_POINTS;
    state.lastCircleUpdate = now;
    return getNextCirclePosition(masterPos);
  }
  return getNextCirclePosition(masterPos);
}

async function updateCombat(manager: Core) {
  if (!state.isAttacking) return;

  const { master } = manager.getMaster();
  if (!master) {
    await stopAttacking(manager);
    return;
  }

  const masterPlayer = manager.bot.players[master];
  if (!masterPlayer?.entity) {
    manager.bot.chat(manager.i18n.get(manager.language, "commands", "attack.lost_master") as string);
    return;
  }

  const health = manager.bot.health;
  const food = manager.bot.food;
  
  if (health <= CRITICAL_HEALTH_THRESHOLD) {
    await equipTotem(manager);
  }

  if (health <= LOW_HEALTH_THRESHOLD && food < 20) {
    if (manager.bot.autoEat) {
      manager.bot.autoEat.enable();
    }
    return;
  } else if (manager.bot.autoEat) {
    manager.bot.autoEat.disable();
  }

  const nearestPlayer = manager.bot.nearestEntity(entity => {
    if (!entity || entity.type !== 'player') return false;
    const playerName = entity.username;
    return playerName !== master && playerName !== manager.bot.username;
  });

  if (health <= LOW_HEALTH_THRESHOLD) {
    const goal = new goals.GoalFollow(masterPlayer.entity, 1);
    manager.bot.pathfinder.setGoal(goal);
    return;
  }

  if (nearestPlayer && manager.bot.entity.position.distanceTo(nearestPlayer.position) <= MAX_ATTACK_RANGE) {
    await equipBestWeapon(manager);
    
    if (manager.bot.entity.position.distanceTo(nearestPlayer.position) <= ATTACK_RANGE) {
      if (manager.bot.pvp) {
        manager.bot.pvp.attack(nearestPlayer);
      } else {
        await manager.bot.lookAt(nearestPlayer.position.offset(0, nearestPlayer.height * 0.9, 0));
        manager.bot.attack(nearestPlayer);
      }

      const circlePos = await updateCirclePosition(manager, masterPlayer.entity.position);
      const goal = new goals.GoalNear(circlePos.x, circlePos.y, circlePos.z, 1);
      manager.bot.pathfinder.setGoal(goal);
    } else {
      const targetPos = nearestPlayer.position;
      const masterPos = masterPlayer.entity.position;
      
      const midPoint = new Vec3(
        (masterPos.x + targetPos.x) / 2,
        (masterPos.y + targetPos.y) / 2,
        (masterPos.z + targetPos.z) / 2
      );
      
      const goal = new goals.GoalNear(midPoint.x, midPoint.y, midPoint.z, 2);
      manager.bot.pathfinder.setGoal(goal);
    }
  } else {
    const circlePos = await updateCirclePosition(manager, masterPlayer.entity.position);
    const goal = new goals.GoalNear(circlePos.x, circlePos.y, circlePos.z, 1);
    manager.bot.pathfinder.setGoal(goal);
  }
}

const AttackCommand: Bot.Command = {
  name: "attack",
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
    const action = message.split(" ")[1]?.toLowerCase();

    if (!action || action === "start") {
      await startAttacking(manager);
    } else if (action === "stop") {
      await stopAttacking(manager);
    } else {
      manager.bot.chat(manager.i18n.get(manager.language, "commands", "attack.invalid_action") as string);
    }
  },
};

export default AttackCommand; 