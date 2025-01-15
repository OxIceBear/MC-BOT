import { Entity } from "prismarine-entity";

const PlayerCollectEvent: Bot.Event = {
    name: "playerCollect",
    once: false,
    execute: async (manager, collector: Entity | undefined, collected?: Entity) => {
        try {
            //skip if not the right conditions
            if (!collector || !manager.getGuarding() || collector !== manager.bot.entity) {
                return;
            }
            if (collected && collected.displayName && (
                collected.displayName === 'Experience Orb' || 
                collected.displayName === 'Thrown Experience Bottle' ||
                collected.displayName.toLowerCase().includes('xp')
            )) {
                return;
            }

            const items = manager.bot.inventory.items();

            //so the inventory is updated every 100ms
            // this is to make sure it doesnt error out
            // and it will find the sword and shield
            // for the guard command and stuff
            await new Promise(resolve => setTimeout(resolve, 100));

            const sword = items.find(item => item && item.name && item.name.includes('sword'));
            const shield = items.find(item => item && item.name && item.name.includes('shield'));

            if (sword) {
                try {
                    //try to equip sword with retries
                    let attempts = 0;
                    while (attempts < 3) {
                        try {
                            await manager.bot.equip(sword, "hand");
                            break;
                        } catch (err) {
                            attempts++;
                            if (attempts === 3) {
                                manager.logger.error("Failed to equip sword after 3 attempts:", err);
                            } else {
                                await new Promise(resolve => setTimeout(resolve, 250));
                            }
                        }
                    }
                } catch (err) {
                    manager.logger.error("Failed to equip sword:", err);
                }
            }

            if (shield) {
                try {
                    //try to equip shield with retries
                    let attempts = 0;
                    while (attempts < 3) {
                        try {
                            await manager.bot.equip(shield, "off-hand");
                            break;
                        } catch (err) {
                            attempts++;
                            if (attempts === 3) {
                                manager.logger.error("Failed to equip shield after 3 attempts:", err);
                            } else {
                                await new Promise(resolve => setTimeout(resolve, 250));
                            }
                        }
                    }
                } catch (err) {
                    manager.logger.error("Failed to equip shield:", err);
                }
            }
        } catch (err) {
            manager.logger.error("Error in playerCollect event:", err);
        }
    },
};

export default PlayerCollectEvent;
