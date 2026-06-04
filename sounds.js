const Sounds = {
  punch:         new Audio('sounds/punch.wav'),
  sword:         new Audio('sounds/sword.mp3'),
  pistol:        new Audio('sounds/pistol.wav'),
  get_hit:       new Audio('sounds/get_hit.wav'),
  death:         new Audio('sounds/death.wav'),
  weapon_switch: new Audio('sounds/weapon_switch.wav'),
};

function playSound(name, volume = 1.0) {
  const s = Sounds[name];
  if (!s) return;
  s.currentTime = 0;
  s.volume      = volume;
  s.play().catch(() => {});
}
