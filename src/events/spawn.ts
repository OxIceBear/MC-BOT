import { mineflayer as viewer } from "prismarine-viewer";
import { CONFIG } from "../config";
import { create_root_state } from "../states/root";
import minecraftData from "minecraft-data";
import { farming } from "../struct/Farming";
import inventory from "mineflayer-web-inventory";

const SpawnEvent: Bot.Event = {
    name: "spawn",
    once: true,
    execute: async (manager) => {
        manager.reset();
        manager.minecraft_data = minecraftData(manager.bot.version);

        await Promise.all([
            viewer(manager.bot, CONFIG.VIEWER_OPTIONS),
            inventory(manager.bot, CONFIG.INVENTORY_VIEWER_OPTION),
        ]);

        create_root_state(manager);
        manager.fetchChests(manager, manager.minecraft_data);
        farming(manager);

        manager.logger.success("Bot successfully spawned");
    },
};

export default SpawnEvent;
