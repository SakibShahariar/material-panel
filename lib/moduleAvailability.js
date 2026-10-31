const OPTIONAL_MODULE_DEPENDENCIES = Object.freeze({
    gpu: Object.freeze([{
        program: 'nvidia-smi',
        label: 'NVIDIA GPU telemetry',
        impact: 'NVIDIA utilization and memory details',
        installHint: 'Install NVIDIA driver utilities to enable NVIDIA-specific details.',
    }]),
    quicksettings: Object.freeze([{
        program: 'brightnessctl',
        label: 'Brightness control',
        impact: 'The brightness slider',
        installHint: 'Install brightnessctl to enable the brightness slider; other Quick Settings controls remain available.',
    }]),
});

/**
 * Return optional host-tool checks for a module. The caller supplies the
 * environment-specific lookup so this helper remains testable outside GNOME.
 */
export function getOptionalModuleDependencies(moduleId, hasProgram) {
    const dependencies = OPTIONAL_MODULE_DEPENDENCIES[moduleId] ?? [];
    return dependencies.map(dependency => ({
        ...dependency,
        available: Boolean(hasProgram(dependency.program)),
    }));
}
