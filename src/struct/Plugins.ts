import { Plugin } from "mineflayer";
import armorManager from "mineflayer-armor-manager";
import { plugin as autoeat } from "mineflayer-auto-eat";
import { plugin as collector } from "mineflayer-collectblock";
import { pathfinder } from "mineflayer-pathfinder";
import { plugin as pvp } from "mineflayer-pvp";
import { Bot } from "mineflayer";
import { Entity } from "prismarine-entity";

interface ExtendedBot extends Bot {
	armorManager?: {
		equipAll: () => Promise<void>;
	};
}

interface ArmorManagerOptions {
	priority?: "leather" | "golden" | "chainmail" | "iron" | "diamond" | "netherite";
	skipClick?: boolean;
}

const armorManagerPlugin = (bot: ExtendedBot): void => {
	try {
		const manager = (armorManager as any)(bot, {
			priority: "diamond",
			skipClick: false
		} as ArmorManagerOptions);
		
		if (!manager) {
			console.error('Failed to initialize armor manager plugin');
			return;
		}
		
		bot.removeAllListeners('playerCollect');
		bot.on('playerCollect', async (collector: Entity, collected: Entity) => {
			if (collected && collected.displayName && (
				collected.displayName === 'Experience Orb' || 
				collected.displayName === 'Thrown Experience Bottle' ||
				collected.displayName.toLowerCase().includes('xp')
			)) {
				return;
			}
			
			try {
				if (bot.armorManager) {
					await new Promise(resolve => setTimeout(resolve, 100));
					await bot.armorManager.equipAll();
				}
			} catch (err) {
				console.error('Error in armor manager:', err);
			}
		});
	} catch (err) {
		console.error('Failed to initialize armor manager plugin:', err);
	}
};

export const plugins: Plugin[] = [
	collector,
	pathfinder,
	armorManagerPlugin as unknown as Plugin,
	autoeat,
	pvp,
];
