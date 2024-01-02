import { Entity } from "prismarine-entity";

const findItemByName = (items: any[], itemName: string) => items.find((item: { name: string | any[]; }) => item.name.includes(itemName));

const PlayerCollectEvent: Bot.Event = {
    name: "playerCollect",
    once: false,
    execute: async (manager, collector: Entity | undefined) => {
        if (!collector || !manager.getGuarding() || collector !== manager.bot.entity) {
            return;
        }

        const items = manager.bot.inventory.items();

        const sword = findItemByName(items, "sword");
        const shield = findItemByName(items, "shield");

        if (sword) {
            await manager.bot.equip(sword, "hand");
        }

        if (shield) {
            await manager.bot.equip(shield, "off-hand");
        }
    },
};

export default PlayerCollectEvent;
