import { Core } from "src/struct/Core";
import { Vec3 } from "vec3";

const FALL_VELOCITY_THRESHOLD = -0.5;
const MOUNTABLE_ENTITIES = ["Boat", "Donkey", "Horse", "Minecart"];
const FALL_PROTECTION_ITEMS = ["water_bucket", "slime_block", "sweet_berries", "cobweb", "hay_block"];

async function equipItemSafely(manager: Core, item: any) {
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    try {
      // Add delay between attempts
      if (attempts > 0) {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      await manager.bot.equip(item, "hand");
      return true;
    } catch (err) {
      attempts++;
      if (attempts === maxAttempts) {
        manager.logger.error(`Failed to equip item after ${maxAttempts} attempts:`, err);
        return false;
      }
    }
  }
  return false;
}

async function handleFalling(manager: Core) {
  try {
    // Wait a tick before handling inventory
    await new Promise(resolve => setTimeout(resolve, 50));
    
    for (const item of manager.bot.inventory.slots) {
      if (
        item &&
        (FALL_PROTECTION_ITEMS.includes(item.name) ||
          item.name.endsWith("_boat"))
      ) {
        const equipped = await equipItemSafely(manager, item);
        if (equipped) break;
      }
    }

    await manager.bot.look(manager.bot.entity.yaw, -Math.PI / 2, true);

    const reference = manager.bot.blockAtCursor(5);
    if (reference && manager.bot.heldItem) {
      if (manager.bot.heldItem.name.endsWith("_bucket") || manager.bot.heldItem.name.endsWith("_boat")) {
        try {
          await manager.bot.activateItem();
        } catch (err) {
          manager.logger.error("Failed to activate item:", err);
        }
      } else {
        await manager.bot.placeBlock(reference, new Vec3(0, 1, 0)).catch((err) => {
          manager.logger.error("Failed to place block:", err);
        });
      }
    }

    await manager.bot.look(manager.bot.entity.yaw, 0);
  } catch (err) {
    manager.logger.error("Error in handleFalling:", err);
  }
}

async function collectWater(manager: Core, waterBlock: any) {
  try {
    // Look at the water block
    await manager.bot.lookAt(waterBlock.position, true);
    
    // Wait a moment for the fall to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Find empty bucket in inventory
    const bucket = manager.bot.inventory.items().find(item => item.name === 'bucket');
    if (!bucket) {
      manager.logger.error("No empty bucket found to collect water");
      return;
    }

    // Equip the bucket
    const equipped = await equipItemSafely(manager, bucket);
    if (!equipped) {
      manager.logger.error("Failed to equip empty bucket");
      return;
    }

    // Collect the water
    try {
      await manager.bot.activateItem();
    } catch (err) {
      manager.logger.error("Failed to collect water:", err);
    }
  } catch (err) {
    manager.logger.error("Error in collectWater:", err);
  }
}

const MoveEvent: Bot.Event = {
  name: "move",
  once: false,
  execute: async (manager) => {
    if (!manager.minecraft_data) {
      manager.logger.error("Minecraft data not initialized");
      return;
    }

    if (manager.bot.entity.velocity.y < FALL_VELOCITY_THRESHOLD) {
      manager.setFalling(true);

      const neighbour = manager.bot.nearestEntity();
      if (
        neighbour &&
        neighbour.displayName &&
        MOUNTABLE_ENTITIES.includes(neighbour.displayName) &&
        manager.bot.entity.position.distanceTo(neighbour.position) < 6
      ) {
        try {
          await manager.bot.mount(neighbour);
          setTimeout(() => {
            try {
              manager.bot.dismount();
            } catch (err) {
              manager.logger.error("Error dismounting:", err);
            }
          }, 100);
          return;
        } catch (err) {
          manager.logger.error("Error mounting entity:", err);
        }
      }

      await handleFalling(manager);
    } else if (manager.getFalling()) {
      manager.setFalling(false);

      const waterBlockId = manager.minecraft_data.blocksByName.water?.id;
      if (typeof waterBlockId !== 'number') {
        manager.logger.error("Could not find water block ID");
        return;
      }

      const waterBlock = manager.bot.findBlock({
        matching: waterBlockId,
        maxDistance: 6,
      });
      
      if (!waterBlock) return;

      try {
        await manager.bot.lookAt(waterBlock.position, true);
        // Add delay before activating item
        await new Promise(resolve => setTimeout(resolve, 100));
        await manager.bot.activateItem();
        
        // After placing water, try to collect it back
        await collectWater(manager, waterBlock);
      } catch (err) {
        manager.logger.error("Error handling water bucket:", err);
      }
    }
  },
};

export default MoveEvent;
