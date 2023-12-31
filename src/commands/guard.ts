const GuardCommand: Bot.Command = {
    name: "guard",
    aliases: [],
    args_definitions: [],
    master_only: true,
    execute: async ({ manager }) => {
        const { getCollecting, getFalling, getFarming, setGuarding, parseMS, bot, i18n, language } = manager;

        if (getCollecting() || getFalling() || getFarming().farmed_at) {
            return bot.chat(i18n.get(language, "commands", "is_acting") as string);
        }

        const guard_at = manager.getGuarding();
        if (!guard_at) {
            setGuarding(true);

            const items = bot.inventory.items();
            const sword = items.find((item) => item.name.includes("sword"));
            const shield = items.find((item) => item.name.includes("shield"));

            if (sword) await bot.equip(sword, "hand");
            if (shield) bot.equip(shield, "off-hand");

            bot.chat(i18n.get(language, "commands", "will_guard") as string);
        } else {
            setGuarding(false);

            const now = Date.now();
            const parsed = parseMS(now - guard_at);

            bot.chat(
                i18n.get(language, "commands", "wont_guard", {
                    days: parsed.days.toString(),
                    hours: parsed.hours.toString(),
                    minutes: parsed.minutes.toString(),
                    seconds: parsed.seconds.toString(),
                }) as string
            );
        }
    },
};

export default GuardCommand;
