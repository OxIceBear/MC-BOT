import { Vec3 } from "vec3";
import { goals, Movements } from "mineflayer-pathfinder";
import { Result } from "bargs";
import type { Bot } from "mineflayer";
import type { Block } from "prismarine-block";
import type { Item } from "prismarine-item";
import type { SafeBlock } from "mineflayer-pathfinder";

interface ExtendedItem extends Item {
    digSpeed?: (block: Block) => number;
}

interface MineArgs extends Result {
    block: string;
    count?: number;
}

const MASTER_RANGE_LIMIT = 60;
const MIN_DISTANCE = 2;

type ToolType = "wood" | "dirt" | "stone" | "default";

// Tool preferences for different block types
const TOOL_PREFERENCES: Record<ToolType, string[]> = {
    wood: ["diamond_axe", "iron_axe", "stone_axe", "wooden_axe"],
    dirt: ["diamond_shovel", "iron_shovel", "stone_shovel", "wooden_shovel"],
    stone: ["diamond_pickaxe", "iron_pickaxe", "stone_pickaxe", "wooden_pickaxe"],
    default: ["diamond_pickaxe", "iron_pickaxe", "stone_pickaxe", "wooden_pickaxe"]
};

// Block names for Minecraft 1.12.2
const WOOD_BLOCKS = ["log", "log2"]; // In 1.12.2 logs use metadata for different types
const DIRT_BLOCKS = ["dirt", "grass", "sand", "gravel", "clay"];

// Block type mappings for 1.12.2
const BLOCK_MAPPINGS: Record<string, string[]> = {
    "oak_log": ["log"],
    "spruce_log": ["log"],
    "birch_log": ["log"],
    "jungle_log": ["log"],
    "acacia_log": ["log2"],
    "dark_oak_log": ["log2"],
    "dirt": ["dirt", "grass"],
    "coal": ["coal_ore"],
    "iron": ["iron_ore"],
    "gold": ["gold_ore"],
    "diamond": ["diamond_ore"],
    "emerald": ["emerald_ore"],
    "redstone": ["redstone_ore", "lit_redstone_ore"],
    "lapis": ["lapis_ore"]
};

async function findSafeBlockToMine(bot: Bot, blockIds: number[], range: number): Promise<Block | null> {
    const movements = new Movements(bot);
    movements.canDig = true;
    movements.dontMineUnderFallingBlock = true;
    
    const blocks = bot.findBlocks({
        matching: blockIds,
        maxDistance: range,
        count: 10 // Find multiple blocks to filter through
    });

    // Filter blocks that are safe to mine
    for (const pos of blocks) {
        const block = bot.blockAt(pos);
        if (!block) {
            continue;
        }
        
        try {
            if (movements.safeToBreak(block as unknown as SafeBlock)) {
                return block;
            }
        } catch (error) {
            // Ignore error and continue to next block
        }
    }
    return null;
}

async function equipBestTool(bot: Bot, block: Block): Promise<boolean> {
    const inventory = bot.inventory.items() as ExtendedItem[];
    
    // Try to find the best tool for the block
    for (const item of inventory) {
        try {
            if (item.digSpeed && item.digSpeed(block) > 1) {
                await bot.equip(item, "hand");
                return true;
            }
        } catch (error) {
            continue;
        }
    }
    return false;
}

const MineCommand: Bot.Command = {
    name: "mine",
    aliases: [],
    args_definitions: [
        {
            name: "block",
            type: String,
            default: true,
        },
        {
            name: "count",
            type: Number,
            aliases: ["c", "n", "number", "limit", "l"],
        }
    ],
    master_only: true,
    execute: async ({ manager, args, message }) => {
        if (
            manager.getCollecting() ||
            manager.getFarming().farmed_at ||
            manager.getFalling() ||
            manager.getGuarding()
        )
            return manager.bot.chat(
                manager.i18n.get(
                    manager.language,
                    "commands",
                    "is_acting",
                ) as string,
            );

        // Parse arguments from the raw message
        const parts = message.split(' ').slice(1); // Remove the command name
        const blockName = parts[0] || '';
        const targetCount = parseInt(parts[1]) || 1;

        manager.logger.info(`[DEBUG] Raw message parts - parts: ${parts.join(', ')}`);
        manager.logger.info(`[DEBUG] Parsed args - block: ${blockName}, count: ${targetCount}`);

        if (!blockName)
            return manager.bot.chat(
                manager.i18n.get(
                    manager.language,
                    "commands",
                    "enter_block_name",
                ) as string,
            );

        // Get all possible block types to search for
        const blockTypes = BLOCK_MAPPINGS[blockName] || [blockName];
        manager.logger.info(`[DEBUG] Block types to search for: ${blockTypes.join(", ")}`);

        const blockIds: number[] = [];

        // Get block IDs for all possible block types
        for (const blockType of blockTypes) {
            const blockData = manager.minecraft_data?.blocksByName[blockType];
            if (blockData) {
                blockIds.push(blockData.id);
                manager.logger.info(`[DEBUG] Found block ID ${blockData.id} for ${blockType}`);
            } else {
                manager.logger.info(`[DEBUG] Could not find block data for ${blockType}`);
            }
        }

        if (blockIds.length === 0)
            return manager.bot.chat(
                manager.i18n.get(
                    manager.language,
                    "commands",
                    "invalid_block",
                ) as string,
            );

        const { master } = manager.getMaster();
        if (!master || !manager.bot.players[master]) {
            return manager.bot.chat(
                manager.i18n.get(
                    manager.language,
                    "commands",
                    "dont_see",
                ) as string,
            );
        }

        const masterEntity = manager.bot.players[master].entity;
        if (!masterEntity) {
            return manager.bot.chat(
                manager.i18n.get(
                    manager.language,
                    "commands",
                    "dont_see",
                ) as string,
            );
        }

        let blocksFound = 0;
        let currentBlock = await findSafeBlockToMine(manager.bot, blockIds, MASTER_RANGE_LIMIT);

        if (!currentBlock) {
            return manager.bot.chat(
                manager.i18n.get(
                    manager.language,
                    "utils",
                    "no_blocks_nearby",
                ) as string,
            );
        }

        manager.bot.chat(
            manager.i18n.get(
                manager.language,
                "utils",
                "found_blocks",
                { count: "1" },
            ) as string,
        );

        while (blocksFound < targetCount && currentBlock) {
            // Check if block is still within range of master
            const distanceToMaster = masterEntity.position.distanceTo(currentBlock.position);
            manager.logger.info(`[DEBUG] Distance to master: ${distanceToMaster}`);

            if (distanceToMaster > MASTER_RANGE_LIMIT) {
                manager.logger.info(`[DEBUG] Block too far from master`);
                break;
            }

            // Check inventory space
            const emptySlots = manager.bot.inventory.slots.filter(slot => slot === null).length;
            manager.logger.info(`[DEBUG] Empty inventory slots: ${emptySlots}`);

            if (emptySlots < 2) {
                manager.bot.chat(
                    manager.i18n.get(
                        manager.language,
                        "commands",
                        "mine.inventory_full",
                    ) as string,
                );
                break;
            }

            try {
                // Equip best tool for the block
                const equipped = await equipBestTool(manager.bot, currentBlock);
                if (!equipped) {
                    manager.bot.chat(
                        manager.i18n.get(
                            manager.language,
                            "commands",
                            "mine.no_tool",
                        ) as string,
                    );
                }

                // Navigate to block
                const movements = new Movements(manager.bot);
                movements.canDig = true;
                movements.dontMineUnderFallingBlock = true;
                manager.bot.pathfinder.setMovements(movements);

                const blockPos = new Vec3(currentBlock.position.x, currentBlock.position.y, currentBlock.position.z);
                manager.logger.info(`[DEBUG] Navigating to block at ${blockPos.x}, ${blockPos.y}, ${blockPos.z}`);

                try {
                    const goal = new goals.GoalGetToBlock(blockPos.x, blockPos.y, blockPos.z);
                    await manager.bot.pathfinder.goto(goal);
                    manager.logger.info(`[DEBUG] Reached block position`);
                } catch (error) {
                    manager.logger.error(`[DEBUG] Failed to navigate to block: ${error}`);
                    throw error;
                }

                // Mine the block
                manager.logger.info(`[DEBUG] Starting to dig block`);
                await manager.bot.dig(currentBlock);
                manager.logger.info(`[DEBUG] Successfully mined block`);
                blocksFound++;
                
                // Show progress
                if (blocksFound % 5 === 0 || blocksFound === targetCount) {
                    manager.bot.chat(
                        manager.i18n.get(
                            manager.language,
                            "commands",
                            "mine.progress",
                            {
                                mined: blocksFound.toString(),
                                total: targetCount.toString(),
                                block: blockName,
                            },
                        ) as string,
                    );
                }

                // Find next nearest block
                manager.logger.info(`[DEBUG] Looking for next block`);
                currentBlock = await findSafeBlockToMine(manager.bot, blockIds, MASTER_RANGE_LIMIT);

            } catch (error) {
                if (currentBlock) {
                    manager.logger.error(`Failed to mine block at ${currentBlock.position}:`, error);
                    manager.logger.info(`[DEBUG] Error while mining: ${error}`);
                }
                break;
            }
        }

        if (blocksFound > 0) {
            manager.bot.chat(
                manager.i18n.get(
                    manager.language,
                    "commands",
                    "blocks_collected",
                ) as string,
            );
        } else {
            manager.bot.chat(
                manager.i18n.get(
                    manager.language,
                    "commands",
                    "mine.unreachable",
                ) as string,
            );
        }
    },
};

export default MineCommand; 