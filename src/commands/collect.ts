const CollectCommad: Bot.Command = {
    name: "collect",
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
        },
    ],
    master_only: true,
    execute: async ({ manager, args }) => {
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

        const { block, count } = args;

        if (!block)
            return manager.bot.chat(
                manager.i18n.get(
                    manager.language,
                    "commands",
                    "enter_block_name",
                ) as string,
            );

        const block_data =
            manager.minecraft_data?.blocksByName[block as string];
        if (!block_data)
            return manager.bot.chat(
                manager.i18n.get(
                    manager.language,
                    "commands",
                    "invalid_block",
                ) as string,
            );

        const is_collected = await manager.collectBlock(manager, block_data.id, count as number);

        if (is_collected) {
            manager.bot.chat(
                manager.i18n.get(
                    manager.language,
                    "commands",
                    "blocks_collected",
                ) as string,
            );
        }
    },
};

export default CollectCommad;
