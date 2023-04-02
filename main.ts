import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	normalizePath
} from "obsidian";
import {addIcons}  from 'icon';
import { Upload2Notion } from "Upload2Notion";
import {NoticeMConfig} from "Message";
import { CLIENT_RENEG_LIMIT } from "tls";


// Remember to rename these classes and interfaces!

interface PluginSettings {
	notionAPI: string;
	databaseID: string;
	bannerUrl: string;
	notionID: string;
	proxy: string;
	allowTags: boolean;
}

const langConfig =  NoticeMConfig( window.localStorage.getItem('language') || 'en')

const DEFAULT_SETTINGS: PluginSettings = {
	notionAPI: "",
	databaseID: "",
	bannerUrl: "",
	notionID: "",
	proxy: "",
	allowTags: false
};

export default class ObsidianSyncNotionPlugin extends Plugin {
	settings: PluginSettings;
async onload() {
    await this.loadSettings();
    addIcons();
    const ribbonIconEl = this.addRibbonIcon(
        "notion-logo",
        "Share to notion",
        async (evt: MouseEvent) => {
            this.upload();
        }
    );

    const statusBarItemEl = this.addStatusBarItem();

    this.addCommand({
        id: 'sync-to-notion',
        name: 'Sync to Notion',
        callback: async () => {
            const notionPageId = await this.promptForNotionPageId();
            if (!notionPageId) {
                return;
            }

            const activeFile = this.app.workspace.getActiveFile();
            if (!activeFile) {
                new Notice('No active file to sync with Notion.');
                return;
            }

            try {
                const result = await this.upload(notionPageId, activeFile);
                new Notice(result.message);
            } catch (error) {
                console.error('Error syncing with Notion:', error);
                new Notice('Error syncing with Notion.');
            }
        },
    });

    this.addSettingTab(new SampleSettingTab(this.app, this));
}

async promptForNotionPageId(): Promise<string | null> {
    return new Promise((resolve) => {
        const { contentEl } = new Prompt(this.app, 'Enter Notion Page ID');
        const input = contentEl.createEl('input', { type: 'text' });

        contentEl.createEl('button', { text: 'Submit' }).addEventListener('click', () => {
            const notionPageId = input.value.trim();
            if (notionPageId) {
                resolve(notionPageId);
            } else {
                resolve(null);
            }
        });
    });
}


	onunload() {}

async upload(notionPageId: string, activeFile: TFile){
    const { notionAPI, databaseID, allowTags } = this.settings;
    if (notionAPI === "" || databaseID === "") {
        new Notice(
            "Please set up the notion API and database ID in the settings tab."
        );
        return;
    }
    const { markDownData, nowFile, tags } =await this.getNowFileMarkdownContent(this.app, activeFile);

    if (markDownData) {
        const { basename } = nowFile;
        const upload = new Upload2Notion(this);
        const res = await upload.syncMarkdownToNotion(basename, allowTags, tags, markDownData, nowFile, this.app, this.settings, notionPageId)
        if(res.status === 200){
            new Notice(`${langConfig["sync-success"]}${basename}`)
        }else {
            new Notice(`${langConfig["sync-fail"]}${basename}`, 5000)
        }
    }
}

	async getNowFileMarkdownContent(app: App, nowFile: TFile) {
		const nowFile = app.workspace.getActiveFile();
		const { allowTags } = this.settings;
		let tags = []
		try {
			if(allowTags) {
				tags = app.metadataCache.getFileCache(nowFile).frontmatter.tags;
			}
		} catch (error) {
			new Notice(langConfig["set-tags-fail"]);
		}
		if (nowFile) {
			const markDownData = await nowFile.vault.read(nowFile);
			return {
				markDownData,
				nowFile,
				tags
			};
		} else {
			new Notice(langConfig["open-file"]);
			return;
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: ObsidianSyncNotionPlugin;

	constructor(app: App, plugin: ObsidianSyncNotionPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", {
			text: "Settings for obsidian to notion plugin.",
		});

		new Setting(containerEl)
			.setName("Notion API Token")
			.setDesc("It's a secret")
			.addText((text) =>{
				let t = text
				.setPlaceholder("Enter your Notion API Token")
				.setValue(this.plugin.settings.notionAPI)
				.onChange(async (value) => {
					this.plugin.settings.notionAPI = value;
					await this.plugin.saveSettings();
				})
				// t.inputEl.type = 'password'
				return t
			});


		const notionDatabaseID = new Setting(containerEl)
			.setName("Database ID")
			.setDesc("It's a secret")
			.addText((text) => {
				let t = text
				.setPlaceholder("Enter your Database ID")
				.setValue(this.plugin.settings.databaseID)
				.onChange(async (value) => {
					this.plugin.settings.databaseID = value;
					await this.plugin.saveSettings();
				})
				// t.inputEl.type = 'password'
				return t
			}

			);

			// notionDatabaseID.controlEl.querySelector('input').type='password'

			new Setting(containerEl)
			.setName("Banner url(optional)")
			.setDesc("page banner url(optional), default is empty, if you want to show a banner, please enter the url(like:https://raw.githubusercontent.com/EasyChris/obsidian-to-notion/ae7a9ac6cf427f3ca338a409ce6967ced9506f12/doc/2.png)")
			.addText((text) =>
				text
					.setPlaceholder("Enter banner pic url: ")
					.setValue(this.plugin.settings.bannerUrl)
					.onChange(async (value) => {
						this.plugin.settings.bannerUrl = value;
						await this.plugin.saveSettings();
					})
			);


			new Setting(containerEl)
			.setName("Notion ID(optional)")
			.setDesc("Your notion ID(optional),share link likes:https://username.notion.site/,your notion id is [username]")
			.addText((text) =>
				text
					.setPlaceholder("Enter notion ID(options) ")
					.setValue(this.plugin.settings.notionID)
					.onChange(async (value) => {
						this.plugin.settings.notionID = value;
						await this.plugin.saveSettings();
					})
			);


			new Setting(containerEl)
			.setName("Convert tags(optional)")
			.setDesc("Transfer the Obsidian tags to the Notion table. It requires the column with the name 'Tags'")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.allowTags)
					.onChange(async (value) => {
						this.plugin.settings.allowTags = value;
						await this.plugin.saveSettings();
					})
			);

	}
}
