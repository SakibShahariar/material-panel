import St from 'gi://St';

export function buildWorkspaces() {
    const box = new St.BoxLayout({style_class: 'material-panel-workspaces'});
    const manager = global.workspace_manager;

    const rebuild = () => {
        box.destroy_all_children();
        const activeIndex = manager.get_active_workspace_index();
        for (let i = 0; i < manager.get_n_workspaces(); i++) {
            const btn = new St.Button({
                style_class: i === activeIndex
                    ? 'material-panel-workspace-btn active'
                    : 'material-panel-workspace-btn',
                label: `${i + 1}`,
                reactive: true,
                track_hover: true,
                can_focus: true,
            });
            btn.connect('clicked', () => {
                manager.get_workspace_by_index(i).activate(global.get_current_time());
            });
            box.add_child(btn);
        }
    };

    rebuild();
    const changedId = manager.connect('active-workspace-changed', rebuild);
    const nChangedId = manager.connect('notify::n-workspaces', rebuild);

    box.connect('destroy', () => {
        manager.disconnect(changedId);
        manager.disconnect(nChangedId);
    });

    return box;
}
