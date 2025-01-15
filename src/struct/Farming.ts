import { CONFIG } from "../config";
import { Vec3 } from "vec3";
import { Core } from "./Core";
import { Item } from "prismarine-item";
import { Chest } from "mineflayer";

export async function farming(manager: Core) {
	if (manager.getFarming().farmed_at) {
		if (
			manager.bot.inventory.slots.filter((item) => item == null).length <
			11
		)
			await depositLoop(manager);
		else await farmLoop(manager);
	}

	setTimeout(() => farming(manager), 500);
}

async function depositLoop(manager: Core) {
	const { farming, farming_chest } = manager.getFarming();

	if (!farming_chest)
		return manager.bot.chat(
			manager.i18n.get(manager.language, "commands", "no_chests_found", {
				prefix: CONFIG.PREFIX,
			}) as string,
		);

	const chest = manager.bot.blockAt(farming_chest);
	if (!chest)
		return manager.bot.chat(
			manager.i18n.get(manager.language, "commands", "no_chests_found", {
				prefix: CONFIG.PREFIX,
			}) as string,
		);

	const distance = manager.bot.entity.position.distanceTo(farming_chest);
	if (distance >= 2) {
		const crops = manager.bot.findBlocks({
			matching: (block) => block.name === farming,
			maxDistance: 16,
			count: 64
		});
		
		if (crops.length > 0) {
			const safePath = crops.reduce((acc, crop) => {
				const cropDist = farming_chest.distanceTo(new Vec3(crop.x, crop.y, crop.z));
				if (cropDist > 1) acc.push(new Vec3(crop.x, crop.y, crop.z));
				return acc;
			}, [] as Vec3[]);

			if (safePath.length > 0) {
				const closest = safePath.reduce((prev, curr) => {
					const prevDist = manager.bot.entity.position.distanceTo(prev);
					const currDist = manager.bot.entity.position.distanceTo(curr);
					return prevDist < currDist ? prev : curr;
				});
				
				try {
					await manager.goTo(closest);
				} catch (err) {
					manager.logger.error("Failed to navigate to safe point:", err);
				}
			}
		}

		manager.bot.lookAt(farming_chest);
		manager.bot.setControlState("forward", true);
		manager.bot.setControlState("sprint", false);
	} else {
		manager.bot.setControlState("forward", false);
		manager.bot.setControlState("sprint", false);

		try {
			const window = await manager.bot.openChest(chest);
			let depositError = false;

			for (const slot of manager.bot.inventory.items()) {
				try {
					if (slot.name == farming) {
						await deposit(window, slot);
					}
				} catch (err) {
					depositError = true;
					manager.logger.error("Failed to deposit item:", err);
					
					manager.bot.chat(
						manager.i18n.get(manager.language, "utils", "chest_full", {
							prefix: CONFIG.PREFIX,
						}) as string,
					);

					break;
				}
			}

			await window.close();
			
			if (depositError) {
				manager.setFarming();
			}
		} catch (err) {
			manager.logger.error("Failed to interact with chest:", err);
			manager.bot.chat(
				manager.i18n.get(manager.language, "commands", "chest_error", {
					prefix: CONFIG.PREFIX,
				}) as string,
			);
		}
	}
}

async function deposit(window: Chest, slot: Item): Promise<void> {
	return new Promise((resolve, reject) => {
		window.deposit(slot.type, null, slot.count)
			.then(resolve)
			.catch((err) => {
				console.error("Deposit error:", err);
				reject(err);
			});
	});
}

async function farmLoop(manager: Core) {
	const { seed, farming } = manager.getFarming();

	const crop = manager.bot.findBlock({
		matching: (block) => {
			return block.name == farming && block.metadata == 7;
		},
	});

	if (crop) {
		manager.bot.lookAt(crop.position);

		try {
			if (manager.bot.entity.position.distanceTo(crop.position) < 2) {
				manager.bot.setControlState("forward", false);

				await manager.bot.dig(crop);

				if (!manager.bot.heldItem || manager.bot.heldItem.name != seed)
					for (const item of manager.bot.inventory.slots) {
						if (item && item.name === seed) {
							await manager.bot.equip(item, "hand");
							break;
						}
					}

				if (!manager.bot.heldItem) return;

				const dirt = manager.bot.blockAt(
					crop.position.offset(0, -1, 0),
				);
				if (!dirt) return;
				await manager.bot
					.placeBlock(dirt, new Vec3(0, 1, 0))
					.catch(() => undefined); // idk why but sometimes bot places seed but throws error
			} else manager.bot.setControlState("forward", true); // didn't used pathfinder because bot destroys crops
		} catch (err) {
			manager.logger.error(err);
		}
	}
}
