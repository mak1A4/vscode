/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { AccessibilityHelpNLS } from 'vs/editor/common/standaloneStrings';
import { ToggleTabFocusModeAction } from 'vs/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode';
import { localize } from 'vs/nls';
import { AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { AccessibilityHelpAction, AccessibilityViewAction, registerAccessibilityConfiguration } from 'vs/workbench/contrib/accessibility/browser/accessibilityContribution';
import { AccessibleViewService, IAccessibleContentProvider, IAccessibleViewOptions, IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import * as strings from 'vs/base/common/strings';
import * as platform from 'vs/base/common/platform';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { NEW_UNTITLED_FILE_COMMAND_ID } from 'vs/workbench/contrib/files/browser/fileConstants';
import { ModesHoverController } from 'vs/editor/contrib/hover/browser/hover';
import { withNullAsUndefined } from 'vs/base/common/types';

registerAccessibilityConfiguration();
registerSingleton(IAccessibleViewService, AccessibleViewService, InstantiationType.Delayed);

class AccessibilityHelpProvider extends Disposable implements IAccessibleContentProvider {
	onClose() {
		this._editor.focus();
		this.dispose();
	}
	options: IAccessibleViewOptions = { isHelpMenu: true, ariaLabel: localize('terminal-help-label', "terminal accessibility help") };
	id: string = 'editor';
	constructor(
		private readonly _editor: ICodeEditor,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
		super();
		let url = (this._editor.getRawOptions() as any).accessibilityHelpUrl;
		if (typeof url === 'undefined') {
			url = 'https://go.microsoft.com/fwlink/?linkid=852450';
		}
		this.options.readMoreUrl = url;
	}

	private _descriptionForCommand(commandId: string, msg: string, noKbMsg: string): string {
		const kb = this._keybindingService.lookupKeybinding(commandId);
		if (kb) {
			return strings.format(msg, kb.getAriaLabel());
		}
		return strings.format(noKbMsg, commandId);
	}

	provideContent(): string {
		const options = this._editor.getOptions();
		const content = [];
		content.push(AccessibilityHelpNLS.accessibilityHelpTitle);

		if (options.get(EditorOption.inDiffEditor)) {
			if (options.get(EditorOption.readOnly)) {
				content.push(AccessibilityHelpNLS.readonlyDiffEditor);
			} else {
				content.push(AccessibilityHelpNLS.editableDiffEditor);
			}
		} else {
			if (options.get(EditorOption.readOnly)) {
				content.push(AccessibilityHelpNLS.readonlyEditor);
			} else {
				content.push(AccessibilityHelpNLS.editableEditor);
			}
		}

		const turnOnMessage = (
			platform.isMacintosh
				? AccessibilityHelpNLS.changeConfigToOnMac
				: AccessibilityHelpNLS.changeConfigToOnWinLinux
		);
		switch (options.get(EditorOption.accessibilitySupport)) {
			case AccessibilitySupport.Unknown:
				content.push(turnOnMessage);
				break;
			case AccessibilitySupport.Enabled:
				content.push(AccessibilityHelpNLS.auto_on);
				break;
			case AccessibilitySupport.Disabled:
				content.push(AccessibilityHelpNLS.auto_off, turnOnMessage);
				break;
		}

		if (options.get(EditorOption.tabFocusMode)) {
			content.push(this._descriptionForCommand(ToggleTabFocusModeAction.ID, AccessibilityHelpNLS.tabFocusModeOnMsg, AccessibilityHelpNLS.tabFocusModeOnMsgNoKb));
		} else {
			content.push(this._descriptionForCommand(ToggleTabFocusModeAction.ID, AccessibilityHelpNLS.tabFocusModeOffMsg, AccessibilityHelpNLS.tabFocusModeOffMsgNoKb));
		}
		return content.join('\n');
	}
}

class EditorAccessibilityHelpContribution extends Disposable {
	static ID: 'editorAccessibilityHelpContribution';
	constructor() {
		super();
		this._register(AccessibilityHelpAction.addImplementation(100, 'editor', async accessor => {
			const codeEditorService = accessor.get(ICodeEditorService);
			const accessibleViewService = accessor.get(IAccessibleViewService);
			const instantiationService = accessor.get(IInstantiationService);
			const commandService = accessor.get(ICommandService);
			let codeEditor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
			if (!codeEditor) {
				await commandService.executeCommand(NEW_UNTITLED_FILE_COMMAND_ID);
				codeEditor = codeEditorService.getActiveCodeEditor()!;
			}
			accessibleViewService.registerProvider(instantiationService.createInstance(AccessibilityHelpProvider, codeEditor));
			accessibleViewService.show('editor');
		}));
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(EditorAccessibilityHelpContribution, LifecyclePhase.Eventually);



class HoverAccessibileViewContribution extends Disposable {
	static ID: 'hoverAccessibleViewContribution';
	constructor() {
		super();
		this._register(AccessibilityViewAction.addImplementation(90, 'hover', accessor => {
			const accessibleViewService = accessor.get(IAccessibleViewService);
			const codeEditorService = accessor.get(ICodeEditorService);
			const editor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
			if (!editor) {
				return false;
			}
			const controller = ModesHoverController.get(editor);
			const hoverContent = withNullAsUndefined(controller?.getWidgetContents());
			if (!controller || !hoverContent) {
				return false;
			}
			function provideContent(): string {
				return hoverContent!;
			}
			const provider = accessibleViewService.registerProvider({
				id: 'hover',
				provideContent,
				onClose() {
					provider.dispose();
					controller.focus();
				},
				options: { ariaLabel: localize('hoverAccessibleView', "Hover Accessible View"), language: 'typescript' }
			});
			accessibleViewService.show('hover');
			return true;
		}));
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(HoverAccessibileViewContribution, LifecyclePhase.Eventually);

