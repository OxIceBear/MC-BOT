import { Core } from "src/struct/Core";
import { Vec3 } from "vec3";

const FALL_VELOCITY_THRESHOLD = -0.5;
const MOUNTABLE_ENTITIES = ["Boat", "Donkey", "Horse", "Minecart"];
const FALL_PROTECTION_ITEMS = [
  "water_bucket",
  "bucket",
  "hay_block",
  "slime_block",
  "sweet_berry_bush",
  "cobweb",
  "boat", "oak_boat", "birch_boat", "spruce_boat", "jungle_boat", "acacia_boat", "dark_oak_boat"
];

async function equipItemSafely(manager: Core, item: any) {
  try {
    await new Promise(resolve => setTimeout(resolve, 50));
    
    if (manager.bot.heldItem && manager.bot.heldItem.name === item.name) {
      return true;
    }
    
    await manager.bot.equip(item, "hand");
    
    return manager.bot.heldItem?.name === item.name;
  } catch (err) {
    manager.logger.error(`Failed to equip item:`, err);
    return false;
  }
}

async function handleFalling(manager: Core) {
  try {
    if (manager.bot.heldItem && FALL_PROTECTION_ITEMS.some(item => 
      manager.bot.heldItem!.name === item || 
      (item === "boat" && manager.bot.heldItem!.name.endsWith("_boat"))
    )) {
      return;
    }

    const inventoryItems = manager.bot.inventory.items();
    
    await manager.bot.look(manager.bot.entity.yaw, -Math.PI / 2, true);
    await new Promise(resolve => setTimeout(resolve, 100));
    const reference = manager.bot.blockAtCursor(5);
    
    const height = manager.bot.entity.position.y;
    const hasReference = !!reference;
    
    const hasHayBlock = inventoryItems.some(item => item.name === "hay_block");
    const hasWaterBucket = inventoryItems.some(item => item.name === "water_bucket");
    
    let prioritizedItems;
    if (hasReference && hasHayBlock) {
      prioritizedItems = ["hay_block"];
    } else if (hasWaterBucket) {
      prioritizedItems = ["water_bucket"];
    } else {
      prioritizedItems = ["bucket", "slime_block", "sweet_berry_bush", "cobweb"];
    }
    
    let equipped = false;
    for (const protectionItem of prioritizedItems) {
      const item = inventoryItems.find(item => item.name === protectionItem);
      if (item) {
        equipped = await equipItemSafely(manager, item);
        if (equipped) {
          break;
        }
      }
    }

    if (!equipped || !manager.bot.heldItem) {
      manager.logger.error("No protection items could be equipped");
      return;
    }

    try {
      if (manager.bot.heldItem.name === "hay_block" && reference) {
        await manager.bot.look(manager.bot.entity.yaw, -Math.PI / 2, true);
        await new Promise(resolve => setTimeout(resolve, 100));
        await manager.bot.placeBlock(reference, new Vec3(0, 1, 0));
      } else if (manager.bot.heldItem.name.endsWith("_bucket")) {
        if (manager.bot.heldItem.name === "bucket" && manager.minecraft_data) {
          const waterBlockId = manager.minecraft_data.blocksByName.water?.id;
          if (typeof waterBlockId === 'number') {
            const waterBlock = manager.bot.findBlock({
              matching: waterBlockId,
              maxDistance: 5,
            });
            
            if (waterBlock) {
              await manager.bot.lookAt(waterBlock.position, true);
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
        }
        await manager.bot.activateItem();
      }
    } catch (err) {
      manager.logger.error(`Failed to use ${manager.bot.heldItem.name}:`, err);
    }

    await manager.bot.look(manager.bot.entity.yaw, 0);
  } catch (err) {
    manager.logger.error("Error in handleFalling:", err);
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
        await new Promise(resolve => setTimeout(resolve, 100));
        await manager.bot.activateItem();
      } catch (err) {
        manager.logger.error("Error handling water bucket:", err);
      }
    }
  },
};

export default MoveEvent;
