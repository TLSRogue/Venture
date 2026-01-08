// /audio/sound-manager.js
// A simple sound manager for game audio effects

const sounds = {};
let masterVolume = 0.5;
let soundEnabled = true;

/**
 * Preload a sound file for later use
 * @param {string} name - Identifier for the sound
 * @param {string} path - Path to the sound file
 */
export function preloadSound(name, path) {
    const audio = new Audio(path);
    audio.preload = 'auto';
    sounds[name] = audio;
}

/**
 * Play a sound effect
 * @param {string} name - Sound identifier
 * @param {number} volume - Volume from 0.0 to 1.0 (relative to master volume)
 */
export function playSound(name, volume = 1.0) {
    if (!soundEnabled || !sounds[name]) return;

    try {
        // Clone the audio to allow overlapping sounds
        const sound = sounds[name].cloneNode();
        sound.volume = Math.min(1.0, volume * masterVolume);
        sound.play().catch(e => {
            // Browsers often block autoplay, this is expected
            console.debug('Audio play blocked:', e.message);
        });
    } catch (e) {
        console.debug('Sound play error:', e);
    }
}

/**
 * Set the master volume for all sounds
 * @param {number} volume - Volume from 0.0 to 1.0
 */
export function setMasterVolume(volume) {
    masterVolume = Math.max(0, Math.min(1, volume));
    localStorage.setItem('soundVolume', masterVolume.toString());
}

/**
 * Get the current master volume
 * @returns {number}
 */
export function getMasterVolume() {
    return masterVolume;
}

/**
 * Enable or disable all sounds
 * @param {boolean} enabled
 */
export function setSoundEnabled(enabled) {
    soundEnabled = enabled;
    localStorage.setItem('soundEnabled', enabled.toString());
}

/**
 * Check if sound is enabled
 * @returns {boolean}
 */
export function isSoundEnabled() {
    return soundEnabled;
}

/**
 * Initialize sound settings from localStorage
 */
export function initSoundSettings() {
    const savedVolume = localStorage.getItem('soundVolume');
    const savedEnabled = localStorage.getItem('soundEnabled');

    if (savedVolume !== null) {
        masterVolume = parseFloat(savedVolume);
    }
    if (savedEnabled !== null) {
        soundEnabled = savedEnabled === 'true';
    }
}

/**
 * Preload all game sounds
 * Add your sound files to /assets/sounds/ and register them here
 */
export function preloadAllSounds() {
    // Combat sounds
    preloadSound('hit', '/assets/sounds/hit.mp3');
    preloadSound('miss', '/assets/sounds/miss.mp3');
    preloadSound('critical', '/assets/sounds/critical.mp3');
    preloadSound('block', '/assets/sounds/block.mp3');
    preloadSound('parry', '/assets/sounds/parry.mp3');

    // Magic sounds
    preloadSound('spell_fire', '/assets/sounds/spell_fire.mp3');
    preloadSound('spell_ice', '/assets/sounds/spell_ice.mp3');
    preloadSound('spell_heal', '/assets/sounds/spell_heal.mp3');
    preloadSound('spell_generic', '/assets/sounds/spell_generic.mp3');

    // UI sounds
    preloadSound('click', '/assets/sounds/click.mp3');
    preloadSound('open', '/assets/sounds/open.mp3');
    preloadSound('close', '/assets/sounds/close.mp3');
    preloadSound('error', '/assets/sounds/error.mp3');

    // Reward sounds
    preloadSound('coins', '/assets/sounds/coins.mp3');
    preloadSound('loot', '/assets/sounds/loot.mp3');
    preloadSound('levelup', '/assets/sounds/levelup.mp3');
    preloadSound('quest_accepted', '/assets/sounds/questaccepted.wav');
    preloadSound('quest_complete', '/assets/sounds/questcomplete.wav');

    // Combat sounds (wav)
    preloadSound('punch', '/assets/sounds/punch.wav');

    // Adventure sounds
    preloadSound('enemy_appear', '/assets/sounds/enemy_appear.mp3');
    preloadSound('victory', '/assets/sounds/victory.mp3');
    preloadSound('defeat', '/assets/sounds/defeat.mp3');
    preloadSound('flee', '/assets/sounds/flee.mp3');

    // Resource sounds
    preloadSound('mining', '/assets/sounds/mining.mp3');
    preloadSound('woodcutting', '/assets/sounds/woodcutting.mp3');
    preloadSound('fishing', '/assets/sounds/fishing.mp3');
    preloadSound('harvesting', '/assets/sounds/harvesting.mp3');
}

// Initialize on module load
initSoundSettings();
