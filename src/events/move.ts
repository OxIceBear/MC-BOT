import { Core } from "src/struct/Core";
import { Vec3 } from "vec3";

const FALL_VELOCITY_THRESHOLD = -0.5;

async function handleFalling(manager: any) {
  try {
    for (const item of manager.bot.inventory.slots) {
      if (
        item &&
        (["water_bucket", "slime_block", "sweet_berries", "cobweb", "hay_block"].includes(item.name) ||
          item.name.endsWith("_boat"))
      ) {
        await manager.bot.equip(item, "hand");
        break;
      }
    }

    await manager.bot.look(manager.bot.entity.yaw, -Math.PI / 2, true);

    const reference = manager.bot.blockAtCursor(5);
    if (reference && manager.bot.heldItem) {
      if (manager.bot.heldItem.name.endsWith("_bucket") || manager.bot.heldItem.name.endsWith("_boat")) {
        await manager.bot.activateItem();
      } else {
        await manager.bot.placeBlock(reference, new Vec3(0, 1, 0)).catch(() => undefined);
      }
    }

    await manager.bot.look(manager.bot.entity.yaw, 0);
  } catch (err) {
    manager.logger.error(err);
  }
}

const MoveEvent: Bot.Event = {
  name: "move",
  once: false,
  execute: async (manager) => {
    if (manager.bot.entity.velocity.y < FALL_VELOCITY_THRESHOLD) {
      manager.setFalling(true);

      const neighbour = manager.bot.nearestEntity();
      if (
        neighbour &&
        ["Boat", "Donkey", "Horse", "Minecart"].includes(neighbour.mobType as string) &&
        manager.bot.entity.position.distanceTo(neighbour.position) < 6
      ) {
        manager.bot.mount(neighbour);
        setTimeout(manager.bot.dismount, 100);
        return;
      }

      await handleFalling(manager);
    } else if (manager.getFalling()) {
      manager.setFalling(false);

      const waterBlock = manager.bot.findBlock({
        matching: [26],
        maxDistance: 6,
      });
      if (!waterBlock) return;

      await manager.bot.lookAt(waterBlock.position, true);
      await manager.bot.activateItem();
    }
  },
};

export default MoveEvent;
