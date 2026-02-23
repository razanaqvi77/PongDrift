import './style.css'

type Paddle = {
  x: number
  y: number
  width: number
  height: number
  speed: number
}

type Ball = {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
}

type GravityWell = {
  x: number
  y: number
  strength: number
  softening: number
}

type Difficulty = {
  name: 'Easy' | 'Challenging' | 'Hard'
  reactionMs: number
  maxSpeed: number
  errorPx: number
}

type GameState = 'splash' | 'playing' | 'paused' | 'postmatch'
type MatchModifier =
  | 'Curve Drift'
  | 'Big Ball'
  | 'Sticky Paddle'
  | 'Ion Wind'
  | 'Twin Orbit'
  | 'Drifting Wells'
  | 'Gravity Pulse'
  | 'Ghost Ball'
type ModifierSelection = 'Random' | MatchModifier

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
}

type Cosmetic = {
  name: string
  unlockLevel: number
  playerColor: string
  aiColor: string
  trailColor: string
}

type Progression = {
  xp: number
}

const SCORE_LIMITS = {
  min: 5,
  max: 20,
  default: 5,
}
const PROGRESSION_KEY = 'pongdrift_progress_v1'
const XP_PER_LEVEL = 140

const cosmetics: Cosmetic[] = [
  {
    name: 'Nebula Classic',
    unlockLevel: 1,
    playerColor: 'rgba(240, 246, 255, 0.95)',
    aiColor: 'rgba(158, 214, 255, 0.95)',
    trailColor: '125, 214, 255',
  },
  {
    name: 'Solar Flare',
    unlockLevel: 3,
    playerColor: 'rgba(255, 229, 170, 0.95)',
    aiColor: 'rgba(255, 163, 102, 0.95)',
    trailColor: '255, 179, 116',
  },
  {
    name: 'Emerald Rush',
    unlockLevel: 5,
    playerColor: 'rgba(199, 255, 228, 0.95)',
    aiColor: 'rgba(85, 225, 186, 0.95)',
    trailColor: '103, 240, 186',
  },
]

const modifierDescriptions: Record<MatchModifier, string> = {
  'Curve Drift': 'Periodic vertical force bends the ball path.',
  'Big Ball': 'Larger ball radius increases collision chaos.',
  'Sticky Paddle': 'Paddle contact briefly holds then releases the ball.',
  'Ion Wind': 'Horizontal wind oscillation shifts ball velocity.',
  'Twin Orbit': 'A second ball activates after sustained rallies.',
  'Drifting Wells': 'Gravity wells drift across the arena over time.',
  'Gravity Pulse': 'A rotating pulse force periodically shoves the ball.',
  'Ghost Ball': 'The ball phases to low visibility in timed intervals.',
}

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) {
  throw new Error('App root not found')
}

app.innerHTML = `
  <canvas id="game" aria-label="Pong Drift"></canvas>
  <div class="hud">
    <div id="modifierBadge" class="badge"></div>
    <div id="rallyMeter" class="hud-value">Rally 0</div>
    <div id="xpMeter" class="hud-sub">Level 1 • 0 XP</div>
  </div>
  <div id="eventToast" class="event-toast"></div>
  <div id="postMatch" class="post-match hidden">
    <div class="post-card">
      <h2 id="postTitle">Match Complete</h2>
      <p id="postSummary"></p>
      <p id="postXp"></p>
      <p id="postUnlocks"></p>
      <button id="rematchBtn" type="button">Rematch</button>
    </div>
  </div>
  <div class="ui">
    <div class="ui-title">Pong Drift</div>
    <label>
      Difficulty
      <select id="difficulty">
        <option value="Easy" selected>Easy</option>
        <option value="Challenging">Challenging</option>
        <option value="Hard">Hard</option>
      </select>
    </label>
    <label>
      Modifier
      <select id="modifierMode"></select>
    </label>
    <div id="modifierDescription" class="hint modifier-description"></div>
    <label>
      Target Score
      <select id="targetScore"></select>
    </label>
    <label class="toggle">
      <input type="checkbox" id="speedRamp" checked />
      Speed Ramp
    </label>
    <label class="toggle">
      <input type="checkbox" id="mute" />
      Mute
    </label>
    <label class="toggle">
      <input type="checkbox" id="trails" checked />
      Trails
    </label>
    <div class="hint">Drag to move • Tap resume • Double-tap pause • G / Space / Enter</div>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#game')
const difficultySelect = document.querySelector<HTMLSelectElement>('#difficulty')
const modifierModeSelect = document.querySelector<HTMLSelectElement>('#modifierMode')
const modifierDescription = document.querySelector<HTMLDivElement>('#modifierDescription')
const targetScoreSelect = document.querySelector<HTMLSelectElement>('#targetScore')
const speedRampToggle = document.querySelector<HTMLInputElement>('#speedRamp')
const muteToggle = document.querySelector<HTMLInputElement>('#mute')
const trailsToggle = document.querySelector<HTMLInputElement>('#trails')
const modifierBadge = document.querySelector<HTMLDivElement>('#modifierBadge')
const rallyMeter = document.querySelector<HTMLDivElement>('#rallyMeter')
const xpMeter = document.querySelector<HTMLDivElement>('#xpMeter')
const eventToast = document.querySelector<HTMLDivElement>('#eventToast')
const postMatch = document.querySelector<HTMLDivElement>('#postMatch')
const postTitle = document.querySelector<HTMLHeadingElement>('#postTitle')
const postSummary = document.querySelector<HTMLParagraphElement>('#postSummary')
const postXp = document.querySelector<HTMLParagraphElement>('#postXp')
const postUnlocks = document.querySelector<HTMLParagraphElement>('#postUnlocks')
const rematchBtn = document.querySelector<HTMLButtonElement>('#rematchBtn')
const hud = document.querySelector<HTMLDivElement>('.hud')
const settingsUi = document.querySelector<HTMLDivElement>('.ui')

if (!canvas || !difficultySelect || !modifierModeSelect || !modifierDescription || !targetScoreSelect || !speedRampToggle || !muteToggle || !trailsToggle) {
  throw new Error('Required UI elements are missing')
}
const ctx = canvas.getContext('2d')
if (!ctx) {
  throw new Error('2D context not available')
}

const BALANCE = {
  twinOrbitRallyThreshold: 3,
  difficulty: {
    Easy: { reactionMs: 180, maxSpeed: 380, errorPx: 40 },
    Challenging: { reactionMs: 140, maxSpeed: 440, errorPx: 28 },
    Hard: { reactionMs: 72, maxSpeed: 700, errorPx: 10 },
  },
  ai: {
    errorScale: { Easy: 1, Challenging: 1.08, Hard: 0.65 },
    rallyErrorPerHit: 0.03,
    maxRallyErrorBoost: 0.5,
    speedBoostCap: { Easy: 0, Challenging: 0.09, Hard: 0.28 },
    speedBoostPerHit: 0.015,
    trackingGain: 2.8,
    smoothing: 8,
  },
  rallySpeedRamp: {
    perHit: 0.0045,
    maxRate: 0.022,
    mainBallMaxSpeed: 1100,
    orbitBallMaxSpeed: 1080,
  },
  driftingWells: {
    xAmplitudeRatio: 0.09,
    yAmplitudeRatio: 0.12,
    xSpeed: 0.52,
    ySpeed: 0.38,
  },
  gravityPulse: {
    force: 175,
    frequency: 2.4,
    rotationSpeed: 0.9,
  },
  ghostBall: {
    cycle: 2.8,
    hiddenDuration: 0.95,
    fadeDuration: 0.2,
    minAlpha: 0.18,
  },
} as const

const difficultyPresets: Record<string, Difficulty> = {
  Easy: { name: 'Easy', ...BALANCE.difficulty.Easy },
  Challenging: { name: 'Challenging', ...BALANCE.difficulty.Challenging },
  Hard: { name: 'Hard', ...BALANCE.difficulty.Hard },
}

const splashConfig = {
  animDuration: 2.2,
  pauseDuration: 0.6,
  fadeDuration: 1.0,
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const loadProgression = (): Progression => {
  const fallback = { xp: 0 }
  try {
    const raw = localStorage.getItem(PROGRESSION_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<Progression>
    if (typeof parsed.xp !== 'number' || Number.isNaN(parsed.xp)) return fallback
    return { xp: Math.max(0, Math.floor(parsed.xp)) }
  } catch {
    return fallback
  }
}

const saveProgression = (progression: Progression) => {
  localStorage.setItem(PROGRESSION_KEY, JSON.stringify(progression))
}

const getLevelFromXP = (xp: number) => 1 + Math.floor(xp / XP_PER_LEVEL)

const getCurrentCosmetic = (level: number) => {
  let selected = cosmetics[0]
  for (const cosmetic of cosmetics) {
    if (level >= cosmetic.unlockLevel) {
      selected = cosmetic
    }
  }
  return selected
}

let progression = loadProgression()
let currentLevel = getLevelFromXP(progression.xp)
let currentCosmetic = getCurrentCosmetic(currentLevel)

const gainXP = (amount: number) => {
  const beforeLevel = getLevelFromXP(progression.xp)
  progression.xp += amount
  saveProgression(progression)
  const afterLevel = getLevelFromXP(progression.xp)
  currentLevel = afterLevel
  currentCosmetic = getCurrentCosmetic(currentLevel)

  const unlocked: string[] = []
  for (const cosmetic of cosmetics) {
    if (cosmetic.unlockLevel > beforeLevel && cosmetic.unlockLevel <= afterLevel) {
      unlocked.push(cosmetic.name)
    }
  }

  return { xp: progression.xp, level: afterLevel, unlocked }
}

let currentDifficulty = difficultyPresets.Easy
let selectedModifierMode: ModifierSelection = 'Random'
let targetScore = SCORE_LIMITS.default
let speedRampEnabled = true
let trailsEnabled = true
let gravityEnabled = true
let activeModifier: MatchModifier = 'Curve Drift'
let lastModifier: MatchModifier | null = null

const clampTargetScore = (value: number) => clamp(Math.round(value), SCORE_LIMITS.min, SCORE_LIMITS.max)

const setupTargetScoreOptions = () => {
  if (!targetScoreSelect) return
  targetScoreSelect.innerHTML = ''
  for (let score = SCORE_LIMITS.min; score <= SCORE_LIMITS.max; score += 1) {
    const option = document.createElement('option')
    option.value = String(score)
    option.textContent = String(score)
    if (score === targetScore) option.selected = true
    targetScoreSelect.append(option)
  }
}

const ALL_MODIFIERS: MatchModifier[] = [
  'Curve Drift',
  'Big Ball',
  'Sticky Paddle',
  'Ion Wind',
  'Twin Orbit',
  'Drifting Wells',
  'Gravity Pulse',
  'Ghost Ball',
]

const setupModifierModeOptions = () => {
  modifierModeSelect.innerHTML = ''
  const randomOption = document.createElement('option')
  randomOption.value = 'Random'
  randomOption.textContent = 'Random'
  modifierModeSelect.append(randomOption)

  for (const modifier of ALL_MODIFIERS) {
    const option = document.createElement('option')
    option.value = modifier
    option.textContent = modifier
    modifierModeSelect.append(option)
  }

  modifierModeSelect.value = selectedModifierMode
}

const getSelectedModifierDescription = () => {
  if (selectedModifierMode === 'Random') {
    return `Random each round. Current: ${activeModifier} - ${modifierDescriptions[activeModifier]}`
  }
  return `${selectedModifierMode}: ${modifierDescriptions[selectedModifierMode]}`
}

const audioState = {
  ctx: null as AudioContext | null,
  muted: false,
}

const ensureAudio = () => {
  if (!audioState.ctx) {
    audioState.ctx = new AudioContext()
  }
  if (audioState.ctx.state === 'suspended') {
    audioState.ctx.resume()
  }
}

const playTone = (
  frequency: number,
  duration: number,
  type: OscillatorType,
  volume = 0.06,
  targetFrequency = frequency
) => {
  if (audioState.muted || !audioState.ctx) return
  const audioCtx = audioState.ctx
  const oscillator = audioCtx.createOscillator()
  const gain = audioCtx.createGain()

  oscillator.type = type
  oscillator.frequency.value = frequency
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, targetFrequency), audioCtx.currentTime + duration)

  gain.gain.value = volume
  oscillator.connect(gain)
  gain.connect(audioCtx.destination)

  const now = audioCtx.currentTime
  gain.gain.setValueAtTime(volume, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration)

  oscillator.start(now)
  oscillator.stop(now + duration)
}

const playPaddleHit = (rally: number, speed: number) => {
  const speedFactor = clamp(speed / 1000, 0.2, 1.2)
  const rallyFactor = clamp(rally * 0.03, 0, 0.45)
  const freq = 500 + speedFactor * 280 + rallyFactor * 230
  playTone(freq, 0.06, 'square', 0.05)
  if (rally > 8) {
    playTone(freq * 1.5, 0.045, 'triangle', 0.028, freq * 1.1)
  }
}

const playScore = () => {
  playTone(220, 0.14, 'sine', 0.075, 130)
  playTone(330, 0.16, 'triangle', 0.04, 180)
}

let gameWidth = window.innerWidth
let gameHeight = window.innerHeight

const paddleGap = 40
const paddleSize = { width: 14, height: 120 }

const player: Paddle = {
  x: paddleGap,
  y: gameHeight / 2 - paddleSize.height / 2,
  width: paddleSize.width,
  height: paddleSize.height,
  speed: 740,
}

const ai: Paddle = {
  x: gameWidth - paddleGap - paddleSize.width,
  y: gameHeight / 2 - paddleSize.height / 2,
  width: paddleSize.width,
  height: paddleSize.height,
  speed: 540,
}

const baseBallSpeed = 560
const twinOrbitRallyThreshold = BALANCE.twinOrbitRallyThreshold
const ball: Ball = {
  x: gameWidth / 2,
  y: gameHeight / 2,
  vx: baseBallSpeed,
  vy: 0,
  radius: 9,
}
const orbitBall: Ball = {
  x: gameWidth / 2,
  y: gameHeight / 2,
  vx: -baseBallSpeed,
  vy: 0,
  radius: 8,
}
let orbitBallActive = false

const trail: Array<{ x: number; y: number }> = []
const orbitTrail: Array<{ x: number; y: number }> = []
const particles: Particle[] = []

let playerScore = 0
let aiScore = 0
let rallyCount = 0
let bestRally = 0

let aiTargetY = gameHeight / 2
let aiReactionTimer = 0
let aiVelocity = 0

let serveTimer = 0
let serveDirection: 1 | -1 = 1

let shakeTimer = 0
let shakeDuration = 0.12
let shakeStrength = 9
let scorePulseTimer = 0
let rallyPulseTimer = 0
let toastTimer = 0
let toastText = ''

let modifierClock = 0
let stickyTimer = 0
let stickyOffsetY = 0
let stickyPaddle: Paddle | null = null

let gameState: GameState = 'splash'
let splashTime = 0

let mouseY: number | null = null
let mouseAssistTimer = 0
const keys = new Set<string>()
let activeTouchPointerId: number | null = null
const activeTouchIds = new Set<number>()
let mobileControlMode = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 900

const gravityWells: GravityWell[] = [
  { x: 0, y: 0, strength: 5000000, softening: 3000 },
  { x: 0, y: 0, strength: 5000000, softening: 3000 },
]

const showToast = (message: string, duration = 1.8) => {
  toastText = message
  toastTimer = duration
}

const syncOverlayVisibility = () => {
  const showOverlay = gameState === 'paused' || gameState === 'postmatch'
  hud?.classList.toggle('hidden-ui', !showOverlay)
  settingsUi?.classList.toggle('hidden-ui', !showOverlay)
}

const updateHud = () => {
  if (modifierBadge) modifierBadge.textContent = `Modifier: ${activeModifier}`
  if (modifierDescription) modifierDescription.textContent = getSelectedModifierDescription()
  if (rallyMeter) {
    rallyMeter.textContent = `Rally ${rallyCount}`
    rallyMeter.style.transform = `scale(${1 + clamp(rallyPulseTimer * 0.45, 0, 0.3)})`
  }
  if (xpMeter) {
    xpMeter.textContent = `Level ${currentLevel} • ${progression.xp} XP • ${currentCosmetic.name}`
  }
  if (eventToast) {
    eventToast.textContent = toastText
    eventToast.classList.toggle('visible', toastTimer > 0)
  }
}

const spawnParticles = (x: number, y: number, count: number, speed: number, color: string) => {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2
    const magnitude = speed * (0.35 + Math.random() * 0.75)
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * magnitude,
      vy: Math.sin(angle) * magnitude,
      life: 0.3 + Math.random() * 0.22,
      maxLife: 0.3 + Math.random() * 0.22,
      size: 1.8 + Math.random() * 3.5,
      color,
    })
  }
}

const chooseModifier = (): MatchModifier => {
  const filtered = ALL_MODIFIERS.filter((modifier) => modifier !== lastModifier)
  const picked = filtered[Math.floor(Math.random() * filtered.length)]
  lastModifier = picked
  return picked
}

const resolveModifierForRound = () => {
  if (selectedModifierMode === 'Random') {
    activeModifier = chooseModifier()
  } else {
    activeModifier = selectedModifierMode
    lastModifier = activeModifier
  }
}

const updateWellPositions = (clock = modifierClock) => {
  const baseA = { x: gameWidth * 0.32, y: gameHeight * 0.38 }
  const baseB = { x: gameWidth * 0.68, y: gameHeight * 0.62 }

  if (activeModifier === 'Drifting Wells' && gameState === 'playing') {
    const xAmp = gameWidth * BALANCE.driftingWells.xAmplitudeRatio
    const yAmp = gameHeight * BALANCE.driftingWells.yAmplitudeRatio
    gravityWells[0].x = baseA.x + Math.sin(clock * BALANCE.driftingWells.xSpeed) * xAmp
    gravityWells[0].y = baseA.y + Math.cos(clock * BALANCE.driftingWells.ySpeed) * yAmp
    gravityWells[1].x = baseB.x + Math.cos(clock * BALANCE.driftingWells.xSpeed * 1.08 + 1.2) * xAmp
    gravityWells[1].y = baseB.y + Math.sin(clock * BALANCE.driftingWells.ySpeed * 1.12 + 0.8) * yAmp
    return
  }

  gravityWells[0].x = baseA.x
  gravityWells[0].y = baseA.y
  gravityWells[1].x = baseB.x
  gravityWells[1].y = baseB.y
}

const resize = () => {
  gameWidth = window.innerWidth
  gameHeight = window.innerHeight
  mobileControlMode = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 900
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.floor(gameWidth * dpr)
  canvas.height = Math.floor(gameHeight * dpr)
  canvas.style.width = `${gameWidth}px`
  canvas.style.height = `${gameHeight}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  player.x = paddleGap
  ai.x = gameWidth - paddleGap - paddleSize.width
  player.y = clamp(player.y, 0, gameHeight - player.height)
  ai.y = clamp(ai.y, 0, gameHeight - ai.height)

  updateWellPositions()
}

const resetBall = (targetBall: Ball, direction: 1 | -1) => {
  targetBall.x = gameWidth / 2
  targetBall.y = gameHeight / 2
  const angle = (Math.random() * 0.52 - 0.26) * Math.PI
  targetBall.vx = Math.cos(angle) * baseBallSpeed * direction
  targetBall.vy = Math.sin(angle) * baseBallSpeed
  targetBall.radius = activeModifier === 'Big Ball' ? 13 : 9
}

const spawnOrbitBall = () => {
  orbitBallActive = true
  orbitTrail.length = 0
  const direction: 1 | -1 = ball.vx >= 0 ? -1 : 1
  resetBall(orbitBall, direction)
  orbitBall.radius = 8
  orbitBall.vx *= 0.97
  orbitBall.vy *= 0.97
  showToast('Twin Orbit online!')
}

const startServe = (direction: 1 | -1) => {
  serveDirection = direction
  serveTimer = 0.55
  stickyTimer = 0
  stickyPaddle = null
  orbitBallActive = false
  orbitTrail.length = 0
  resetBall(ball, direction)
}

const applyModifierSetup = () => {
  modifierClock = 0
  stickyTimer = 0
  stickyPaddle = null
  orbitBallActive = false
  orbitTrail.length = 0
  ball.radius = activeModifier === 'Big Ball' ? 13 : 9
  updateWellPositions(0)
}

const startMatch = () => {
  playerScore = 0
  aiScore = 0
  rallyCount = 0
  bestRally = 0
  trail.length = 0
  particles.length = 0
  aiTargetY = gameHeight / 2
  aiReactionTimer = 0
  aiVelocity = 0
  scorePulseTimer = 0
  rallyPulseTimer = 0
  resolveModifierForRound()
  applyModifierSetup()
  startServe(1)
  gameState = 'playing'
  showToast(`New modifier: ${activeModifier}`)
  syncOverlayVisibility()
  updateHud()
}

const startPausedGame = () => {
  startMatch()
  gameState = 'paused'
  syncOverlayVisibility()
}

const togglePause = () => {
  if (gameState === 'playing') {
    gameState = 'paused'
  } else if (gameState === 'paused') {
    gameState = 'playing'
  }
  syncOverlayVisibility()
}

const endMatch = (winner: 'player' | 'ai') => {
  gameState = 'postmatch'
  syncOverlayVisibility()
  const xpGain = 28 + playerScore * 8 + bestRally * 4 + (winner === 'player' ? 36 : 14)
  const progressResult = gainXP(xpGain)
  updateHud()

  if (postMatch) postMatch.classList.remove('hidden')
  if (postTitle) postTitle.textContent = winner === 'player' ? 'Victory' : 'Defeat'
  if (postSummary) postSummary.textContent = `Score ${playerScore}-${aiScore} • Best rally ${bestRally}`
  if (postXp) postXp.textContent = `+${xpGain} XP • Level ${progressResult.level}`
  if (postUnlocks) {
    postUnlocks.textContent =
      progressResult.unlocked.length > 0
        ? `Unlocked: ${progressResult.unlocked.join(', ')}`
        : `Current cosmetic: ${currentCosmetic.name}`
  }
}

const scorePoint = (scorer: 'player' | 'ai', scoringBall: Ball) => {
  if (scorer === 'player') {
    playerScore += 1
  } else {
    aiScore += 1
  }

  playScore()
  scorePulseTimer = 0.4
  shakeTimer = 0.2
  shakeStrength = 13
  spawnParticles(scoringBall.x, scoringBall.y, 22, 220, scorer === 'player' ? '255, 214, 155' : '125, 214, 255')

  rallyCount = 0

  if (playerScore >= targetScore || aiScore >= targetScore) {
    endMatch(playerScore > aiScore ? 'player' : 'ai')
    return
  }

  if (selectedModifierMode === 'Random') {
    resolveModifierForRound()
    applyModifierSetup()
    showToast(`New modifier: ${activeModifier}`)
  }

  startServe(scorer === 'player' ? -1 : 1)
}

const registerPaddleHit = () => {
  rallyCount += 1
  bestRally = Math.max(bestRally, rallyCount)
  rallyPulseTimer = 0.25

  const speed = Math.hypot(ball.vx, ball.vy)
  const speedBoost = 1.04 + clamp(rallyCount * 0.002, 0, 0.08)
  const targetSpeed = clamp(speed * speedBoost, baseBallSpeed, 1040)
  const ratio = targetSpeed / Math.max(1, speed)
  ball.vx *= ratio
  ball.vy *= ratio

  playPaddleHit(rallyCount, targetSpeed)
  shakeTimer = 0.12
  shakeStrength = 8 + Math.min(7, rallyCount * 0.35)
  spawnParticles(ball.x, ball.y, 10 + Math.min(12, rallyCount), 160 + rallyCount * 5, currentCosmetic.trailColor)

  if (activeModifier === 'Twin Orbit' && !orbitBallActive && rallyCount >= twinOrbitRallyThreshold && serveTimer <= 0) {
    spawnOrbitBall()
  }
}

const attachStickyBall = (paddle: Paddle) => {
  stickyPaddle = paddle
  stickyTimer = 0.09
  stickyOffsetY = clamp(ball.y - (paddle.y + paddle.height / 2), -paddle.height * 0.42, paddle.height * 0.42)
}

const applyPaddleCollision = (targetBall: Ball, paddle: Paddle) => {
  const withinX = targetBall.x + targetBall.radius > paddle.x && targetBall.x - targetBall.radius < paddle.x + paddle.width
  const withinY = targetBall.y + targetBall.radius > paddle.y && targetBall.y - targetBall.radius < paddle.y + paddle.height
  if (!withinX || !withinY) return false

  if (targetBall.vx < 0 && paddle === player) {
    targetBall.x = paddle.x + paddle.width + targetBall.radius
  } else if (targetBall.vx > 0 && paddle === ai) {
    targetBall.x = paddle.x - targetBall.radius
  } else {
    return false
  }

  targetBall.vx *= -1
  const offset = (targetBall.y - (paddle.y + paddle.height / 2)) / (paddle.height / 2)
  targetBall.vy += offset * 250
  targetBall.vx = clamp(targetBall.vx, -920, 920)
  targetBall.vy = clamp(targetBall.vy, -920, 920)

  if (targetBall === ball) {
    registerPaddleHit()
  } else {
    playPaddleHit(rallyCount, Math.hypot(targetBall.vx, targetBall.vy))
    shakeTimer = 0.08
    shakeStrength = 7
    spawnParticles(targetBall.x, targetBall.y, 8, 150, currentCosmetic.trailColor)
  }

  if (activeModifier === 'Sticky Paddle' && targetBall === ball) {
    attachStickyBall(paddle)
  }

  return true
}

const applyGravity = (targetBall: Ball, dt: number) => {
  if (!gravityEnabled) return

  for (const well of gravityWells) {
    const dx = well.x - targetBall.x
    const dy = well.y - targetBall.y
    const dist2 = dx * dx + dy * dy
    const dist = Math.sqrt(dist2) || 1
    const dirX = dx / dist
    const dirY = dy / dist
    const force = well.strength / (dist2 + well.softening)
    targetBall.vx += dirX * force * dt
    targetBall.vy += dirY * force * dt
  }
}

const applyModifierForces = (targetBall: Ball, dt: number) => {
  if (activeModifier === 'Curve Drift') {
    targetBall.vy += Math.sin(modifierClock * 5.4) * 70 * dt
  } else if (activeModifier === 'Ion Wind') {
    const wind = Math.sin(modifierClock * 1.8) * 120
    targetBall.vx += wind * dt
  } else if (activeModifier === 'Gravity Pulse') {
    const pulse = Math.sin(modifierClock * BALANCE.gravityPulse.frequency) * BALANCE.gravityPulse.force
    const angle = modifierClock * BALANCE.gravityPulse.rotationSpeed
    targetBall.vx += Math.cos(angle) * pulse * dt
    targetBall.vy += Math.sin(angle * 1.17) * pulse * dt
  }
}

const updateParticles = (dt: number) => {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i]
    p.life -= dt
    if (p.life <= 0) {
      particles.splice(i, 1)
      continue
    }
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vx *= 0.93
    p.vy *= 0.93
  }
}

const updatePlayer = (dt: number) => {
  const up = keys.has('KeyW') || keys.has('ArrowUp')
  const down = keys.has('KeyS') || keys.has('ArrowDown')
  const input = (up ? -1 : 0) + (down ? 1 : 0)

  if (input !== 0) {
    player.y += input * player.speed * dt
    mouseAssistTimer = 0
  } else if (mouseY !== null && mouseAssistTimer > 0) {
    player.y = mouseY - player.height / 2
  }

  player.y = clamp(player.y, 0, gameHeight - player.height)
}

const predictBallYForAI = (targetBall: Ball) => {
  if (targetBall.vx <= 0) return targetBall.y

  const distanceToAi = ai.x - (targetBall.x + targetBall.radius)
  if (distanceToAi <= 0) return targetBall.y

  const timeToAi = distanceToAi / Math.max(1, targetBall.vx)
  const projectedY = targetBall.y + targetBall.vy * timeToAi
  const period = gameHeight * 2
  const wrapped = ((projectedY % period) + period) % period
  return wrapped <= gameHeight ? wrapped : period - wrapped
}

const updateAI = (dt: number) => {
  aiReactionTimer -= dt * 1000
  if (aiReactionTimer <= 0) {
    aiReactionTimer = currentDifficulty.reactionMs
    const baseErrorScale = BALANCE.ai.errorScale[currentDifficulty.name]
    const rallyErrorRamp = 1 + clamp(rallyCount * BALANCE.ai.rallyErrorPerHit, 0, BALANCE.ai.maxRallyErrorBoost)
    const error = (Math.random() * 2 - 1) * currentDifficulty.errorPx * baseErrorScale * rallyErrorRamp

    const incomingBalls = [ball, ...(orbitBallActive ? [orbitBall] : [])].filter((candidate) => candidate.vx > 0)
    const trackingBall =
      incomingBalls.length > 0
        ? incomingBalls.reduce((frontMost, candidate) => (candidate.x > frontMost.x ? candidate : frontMost))
        : ball

    const targetY =
      currentDifficulty.name === 'Easy' ? trackingBall.y : predictBallYForAI(trackingBall)
    aiTargetY = targetY + error
  }

  const centerY = ai.y + ai.height / 2
  const distance = aiTargetY - centerY
  const speedBoostCap = BALANCE.ai.speedBoostCap[currentDifficulty.name]
  const maxTrackingSpeed =
    currentDifficulty.maxSpeed * (1 + clamp(rallyCount * BALANCE.ai.speedBoostPerHit, 0, speedBoostCap))
  const desiredSpeed = clamp(distance * BALANCE.ai.trackingGain, -maxTrackingSpeed, maxTrackingSpeed)
  const smoothing = 1 - Math.exp(-dt * BALANCE.ai.smoothing)
  aiVelocity += (desiredSpeed - aiVelocity) * smoothing
  ai.y += aiVelocity * dt
  ai.y = clamp(ai.y, 0, gameHeight - ai.height)
}

const updateStickyBall = (dt: number) => {
  if (!stickyPaddle || stickyTimer <= 0) return false

  stickyTimer -= dt
  const releaseDir: 1 | -1 = stickyPaddle === player ? 1 : -1
  const anchorX = stickyPaddle === player ? stickyPaddle.x + stickyPaddle.width + ball.radius : stickyPaddle.x - ball.radius
  ball.x = anchorX
  ball.y = stickyPaddle.y + stickyPaddle.height / 2 + stickyOffsetY

  if (stickyTimer <= 0) {
    ball.vx = baseBallSpeed * 1.05 * releaseDir
    ball.vy = stickyOffsetY * 2.1
    stickyPaddle = null
  }

  return true
}

const updateBall = (dt: number) => {
  if (serveTimer > 0) {
    serveTimer -= dt
    ball.x = gameWidth / 2
    ball.y = gameHeight / 2
    return
  }

  if (updateStickyBall(dt)) {
    return
  }

  applyGravity(ball, dt)
  applyModifierForces(ball, dt)

  ball.x += ball.vx * dt
  ball.y += ball.vy * dt

  if (ball.y - ball.radius < 0) {
    ball.y = ball.radius
    ball.vy = Math.abs(ball.vy)
    spawnParticles(ball.x, ball.y, 8, 160, '196, 217, 255')
  } else if (ball.y + ball.radius > gameHeight) {
    ball.y = gameHeight - ball.radius
    ball.vy = -Math.abs(ball.vy)
    spawnParticles(ball.x, ball.y, 8, 160, '196, 217, 255')
  }

  if (!applyPaddleCollision(ball, player)) {
    applyPaddleCollision(ball, ai)
  }

  if (speedRampEnabled && activeModifier !== 'Twin Orbit') {
    const rallySpeedRamp =
      1 + dt * clamp(rallyCount * BALANCE.rallySpeedRamp.perHit, 0, BALANCE.rallySpeedRamp.maxRate)
    ball.vx = clamp(
      ball.vx * rallySpeedRamp,
      -BALANCE.rallySpeedRamp.mainBallMaxSpeed,
      BALANCE.rallySpeedRamp.mainBallMaxSpeed
    )
    ball.vy = clamp(
      ball.vy * rallySpeedRamp,
      -BALANCE.rallySpeedRamp.mainBallMaxSpeed,
      BALANCE.rallySpeedRamp.mainBallMaxSpeed
    )
  }

  if (ball.x + ball.radius < 0) {
    scorePoint('ai', ball)
  } else if (ball.x - ball.radius > gameWidth) {
    scorePoint('player', ball)
  }

  const speed = Math.hypot(ball.vx, ball.vy)
  const dynamicTrail = Math.floor(9 + clamp(speed / 45, 0, 20) + clamp(rallyCount * 0.7, 0, 14))
  trail.push({ x: ball.x, y: ball.y })
  while (trail.length > dynamicTrail) {
    trail.shift()
  }
}

const updateOrbitBall = (dt: number) => {
  if (!orbitBallActive || serveTimer > 0 || gameState !== 'playing') return

  applyGravity(orbitBall, dt)
  applyModifierForces(orbitBall, dt)

  orbitBall.x += orbitBall.vx * dt
  orbitBall.y += orbitBall.vy * dt

  if (orbitBall.y - orbitBall.radius < 0) {
    orbitBall.y = orbitBall.radius
    orbitBall.vy = Math.abs(orbitBall.vy)
    spawnParticles(orbitBall.x, orbitBall.y, 8, 160, '196, 217, 255')
  } else if (orbitBall.y + orbitBall.radius > gameHeight) {
    orbitBall.y = gameHeight - orbitBall.radius
    orbitBall.vy = -Math.abs(orbitBall.vy)
    spawnParticles(orbitBall.x, orbitBall.y, 8, 160, '196, 217, 255')
  }

  if (!applyPaddleCollision(orbitBall, player)) {
    applyPaddleCollision(orbitBall, ai)
  }

  if (orbitBall.x + orbitBall.radius < 0) {
    scorePoint('ai', orbitBall)
    return
  }
  if (orbitBall.x - orbitBall.radius > gameWidth) {
    scorePoint('player', orbitBall)
    return
  }

  const speed = Math.hypot(orbitBall.vx, orbitBall.vy)
  const dynamicTrail = Math.floor(7 + clamp(speed / 60, 0, 14) + clamp(rallyCount * 0.45, 0, 10))
  orbitTrail.push({ x: orbitBall.x, y: orbitBall.y })
  while (orbitTrail.length > dynamicTrail) {
    orbitTrail.shift()
  }
}

const renderBackground = () => {
  const intensity = clamp(rallyCount / 14, 0, 1)

  const bg = ctx.createLinearGradient(0, 0, gameWidth, gameHeight)
  bg.addColorStop(0, `rgba(${14 + intensity * 18}, ${20 + intensity * 12}, ${36 + intensity * 8}, 1)`)
  bg.addColorStop(1, `rgba(${6 + intensity * 6}, ${10 + intensity * 8}, ${18 + intensity * 14}, 1)`)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, gameWidth, gameHeight)

  ctx.strokeStyle = 'rgba(255,255,255,0.16)'
  ctx.lineWidth = 2
  ctx.setLineDash([12, 14])
  ctx.beginPath()
  ctx.moveTo(gameWidth / 2, 30)
  ctx.lineTo(gameWidth / 2, gameHeight - 30)
  ctx.stroke()
  ctx.setLineDash([])
}

const renderWells = () => {
  if (!gravityEnabled) return
  for (const well of gravityWells) {
    const gradient = ctx.createRadialGradient(well.x, well.y, 10, well.x, well.y, 120)
    gradient.addColorStop(0, 'rgba(125, 214, 255, 0.92)')
    gradient.addColorStop(0.35, 'rgba(125, 214, 255, 0.34)')
    gradient.addColorStop(1, 'rgba(125, 214, 255, 0)')

    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(well.x, well.y, 120, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = 'rgba(180, 240, 255, 0.92)'
    ctx.beginPath()
    ctx.arc(well.x, well.y, 8, 0, Math.PI * 2)
    ctx.fill()
  }
}

const renderTrail = () => {
  if (!trailsEnabled || trail.length === 0) return

  const speed = Math.hypot(ball.vx, ball.vy)
  const speedIntensity = clamp(speed / 980, 0.2, 1)
  const ghostAlpha = getGhostBallAlpha()
  trail.forEach((point, index) => {
    const alpha = (index + 1) / trail.length
    const radius = ball.radius * (0.42 + alpha * 0.45)
    ctx.fillStyle = `rgba(${currentCosmetic.trailColor}, ${alpha * 0.25 * speedIntensity * ghostAlpha})`
    ctx.beginPath()
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
    ctx.fill()
  })
}

const renderOrbitTrail = () => {
  if (!trailsEnabled || orbitTrail.length === 0 || !orbitBallActive) return

  const speed = Math.hypot(orbitBall.vx, orbitBall.vy)
  const speedIntensity = clamp(speed / 980, 0.18, 0.9)
  orbitTrail.forEach((point, index) => {
    const alpha = (index + 1) / orbitTrail.length
    const radius = orbitBall.radius * (0.4 + alpha * 0.42)
    ctx.fillStyle = `rgba(255, 192, 138, ${alpha * 0.22 * speedIntensity})`
    ctx.beginPath()
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
    ctx.fill()
  })
}

const renderParticles = () => {
  for (const p of particles) {
    const alpha = clamp(p.life / p.maxLife, 0, 1)
    ctx.fillStyle = `rgba(${p.color}, ${alpha})`
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size * (0.45 + alpha), 0, Math.PI * 2)
    ctx.fill()
  }
}

const renderPaddles = () => {
  ctx.fillStyle = currentCosmetic.playerColor
  ctx.fillRect(player.x, player.y, player.width, player.height)
  ctx.fillStyle = currentCosmetic.aiColor
  ctx.fillRect(ai.x, ai.y, ai.width, ai.height)
}

const getGhostBallAlpha = () => {
  if (activeModifier !== 'Ghost Ball') return 1

  const cycle = BALANCE.ghostBall.cycle
  const hidden = BALANCE.ghostBall.hiddenDuration
  const fade = BALANCE.ghostBall.fadeDuration
  const phase = modifierClock % cycle

  if (phase < hidden) return BALANCE.ghostBall.minAlpha
  if (phase < hidden + fade) {
    const t = (phase - hidden) / fade
    return BALANCE.ghostBall.minAlpha + (1 - BALANCE.ghostBall.minAlpha) * t
  }
  if (phase > cycle - fade) {
    const t = (phase - (cycle - fade)) / fade
    return 1 - (1 - BALANCE.ghostBall.minAlpha) * t
  }
  return 1
}

const renderBall = () => {
  ctx.save()
  ctx.globalAlpha = getGhostBallAlpha()

  const highlightX = ball.x - ball.radius * 0.35
  const highlightY = ball.y - ball.radius * 0.45
  const gradient = ctx.createRadialGradient(
    highlightX,
    highlightY,
    ball.radius * 0.4,
    ball.x,
    ball.y,
    ball.radius * 1.1
  )
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.45, 'rgba(214, 233, 255, 0.95)')
  gradient.addColorStop(1, 'rgba(120, 160, 220, 0.9)')

  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
  ctx.beginPath()
  ctx.arc(highlightX, highlightY, ball.radius * 0.22, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

const renderOrbitBall = () => {
  if (!orbitBallActive) return

  const highlightX = orbitBall.x - orbitBall.radius * 0.35
  const highlightY = orbitBall.y - orbitBall.radius * 0.45
  const gradient = ctx.createRadialGradient(
    highlightX,
    highlightY,
    orbitBall.radius * 0.4,
    orbitBall.x,
    orbitBall.y,
    orbitBall.radius * 1.1
  )
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.45, 'rgba(255, 226, 198, 0.95)')
  gradient.addColorStop(1, 'rgba(255, 153, 102, 0.9)')

  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(orbitBall.x, orbitBall.y, orbitBall.radius, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = 'rgba(255, 255, 255, 0.62)'
  ctx.beginPath()
  ctx.arc(highlightX, highlightY, orbitBall.radius * 0.22, 0, Math.PI * 2)
  ctx.fill()
}

const renderScore = () => {
  const pulse = 1 + clamp(scorePulseTimer * 0.5, 0, 0.24)
  ctx.save()
  ctx.translate(gameWidth / 2, 62)
  ctx.scale(pulse, pulse)
  ctx.fillStyle = `rgba(240, 246, 255, ${0.9 + clamp(scorePulseTimer * 0.25, 0, 0.1)})`
  ctx.font = '700 46px "Space Grotesk", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`${playerScore}  ${aiScore}`, 0, 0)
  ctx.restore()
}

const renderStatus = () => {
  ctx.fillStyle = gravityEnabled ? 'rgba(125, 214, 255, 0.95)' : 'rgba(255, 147, 147, 0.9)'
  ctx.font = '600 14px "Space Grotesk", sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(`Gravity ${gravityEnabled ? 'ON' : 'OFF'}`, gameWidth - 24, 32)
}

const renderServe = () => {
  if (serveTimer <= 0) return
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = '600 16px "Fira Sans", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Serve incoming...', gameWidth / 2, gameHeight * 0.55)
}

const renderSplash = () => {
  if (gameState !== 'splash') return

  const centerX = gameWidth / 2
  const centerY = gameHeight / 2
  const fadeStart = splashConfig.animDuration + splashConfig.pauseDuration
  const fadeProgress = clamp((splashTime - fadeStart) / splashConfig.fadeDuration, 0, 1)
  const fadeAlpha = 1 - fadeProgress
  const t = clamp(splashTime / splashConfig.animDuration, 0, 1)
  const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

  ctx.fillStyle = `rgba(5, 8, 14, ${0.72 * fadeAlpha})`
  ctx.fillRect(0, 0, gameWidth, gameHeight)

  const start = { x: centerX - 140, y: centerY + 30 }
  const control = { x: centerX + 40, y: centerY - 120 }
  const end = { x: centerX + 200, y: centerY + 120 }

  const inv = 1 - ease
  const ballX = inv * inv * start.x + 2 * inv * ease * control.x + ease * ease * end.x
  const ballY = inv * inv * start.y + 2 * inv * ease * control.y + ease * ease * end.y
  const maxRadius = Math.max(gameWidth, gameHeight) * 1.05
  const ballRadius = 4 + ease * maxRadius

  const highlightX = ballX - ballRadius * 0.35
  const highlightY = ballY - ballRadius * 0.45
  const gradient = ctx.createRadialGradient(highlightX, highlightY, ballRadius * 0.2, ballX, ballY, ballRadius * 1.1)
  gradient.addColorStop(0, `rgba(255, 255, 255, ${0.95 * fadeAlpha})`)
  gradient.addColorStop(0.5, `rgba(214, 233, 255, ${0.9 * fadeAlpha})`)
  gradient.addColorStop(1, `rgba(120, 160, 220, ${0.85 * fadeAlpha})`)

  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(ballX, ballY, ballRadius, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = `rgba(255, 255, 255, ${0.55 * fadeAlpha})`
  ctx.beginPath()
  ctx.arc(highlightX, highlightY, ballRadius * 0.18, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = `rgba(234, 242, 255, ${0.95 * fadeAlpha})`
  ctx.font = '700 72px "Space Grotesk", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Pong Drift', centerX, centerY * 0.84)

  ctx.fillStyle = `rgba(125, 214, 255, ${0.9 * fadeAlpha})`
  ctx.font = '500 18px "Fira Sans", sans-serif'
  ctx.fillText('Click or Press Space to Start', centerX, centerY * 1.05)

  ctx.fillStyle = `rgba(255,255,255,${0.7 * fadeAlpha})`
  ctx.font = '400 14px "Fira Sans", sans-serif'
  ctx.fillText('Use Mouse or W/S • Toggle Gravity with G', centerX, centerY * 1.16)
}

const renderPause = () => {
  if (gameState !== 'paused') return
  ctx.fillStyle = 'rgba(5, 8, 14, 0.55)'
  ctx.fillRect(0, 0, gameWidth, gameHeight)
  ctx.fillStyle = 'rgba(234, 242, 255, 0.92)'
  ctx.font = '600 28px "Space Grotesk", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Paused', gameWidth / 2, gameHeight * 0.5)
  ctx.fillStyle = 'rgba(255,255,255,0.82)'
  ctx.font = '500 14px "Fira Sans", sans-serif'
  if (mobileControlMode) {
    ctx.fillText('Tap to Resume', gameWidth / 2, gameHeight * 0.56)
    ctx.fillText('Drag finger up/down to move paddle', gameWidth / 2, gameHeight * 0.60)
    ctx.fillText('Two-finger tap to Pause during play', gameWidth / 2, gameHeight * 0.64)
  } else {
    ctx.fillText('Press Space to Resume', gameWidth / 2, gameHeight * 0.56)
    ctx.fillText('Mouse or W/S (Arrow keys) to move paddle', gameWidth / 2, gameHeight * 0.60)
    ctx.fillText('Press G to toggle gravity', gameWidth / 2, gameHeight * 0.64)
  }
}

const render = () => {
  const speed = Math.hypot(ball.vx, ball.vy)
  // Keep zoom subtle so edge paddles never clip out of frame.
  const rallyZoom = clamp(rallyCount / 44, 0, 0.02)
  const speedZoom = clamp((speed - baseBallSpeed) / 9000, 0, 0.015)
  const zoom = 1 + rallyZoom + speedZoom

  let offsetX = 0
  let offsetY = 0
  if (shakeTimer > 0) {
    const intensity = (shakeTimer / shakeDuration) * shakeStrength
    offsetX = (Math.random() * 2 - 1) * intensity
    offsetY = (Math.random() * 2 - 1) * intensity
  }

  ctx.save()
  ctx.translate(gameWidth / 2 + offsetX, gameHeight / 2 + offsetY)
  ctx.scale(zoom, zoom)
  ctx.translate(-gameWidth / 2, -gameHeight / 2)

  renderBackground()
  renderWells()
  renderTrail()
  renderOrbitTrail()
  renderParticles()
  renderPaddles()
  renderBall()
  renderOrbitBall()
  renderScore()
  renderStatus()
  renderServe()
  renderSplash()
  renderPause()
  ctx.restore()
}

const update = (dt: number) => {
  if (gameState === 'playing') {
    modifierClock += dt
    updateWellPositions()
    updatePlayer(dt)
    updateAI(dt)
    updateBall(dt)
    updateOrbitBall(dt)
  } else if (gameState === 'splash') {
    ball.x = gameWidth / 2
    ball.y = gameHeight / 2
    splashTime += dt
    const splashEnd = splashConfig.animDuration + splashConfig.pauseDuration + splashConfig.fadeDuration
    if (splashTime >= splashEnd) {
      startPausedGame()
    }
  }

  updateParticles(dt)

  if (shakeTimer > 0) {
    shakeTimer = Math.max(0, shakeTimer - dt)
  }

  if (scorePulseTimer > 0) {
    scorePulseTimer = Math.max(0, scorePulseTimer - dt)
  }

  if (rallyPulseTimer > 0) {
    rallyPulseTimer = Math.max(0, rallyPulseTimer - dt)
  }

  if (mouseAssistTimer > 0) {
    mouseAssistTimer = Math.max(0, mouseAssistTimer - dt)
  }

  if (toastTimer > 0) {
    toastTimer = Math.max(0, toastTimer - dt)
    if (toastTimer === 0) {
      toastText = ''
    }
  }

  updateHud()
}

let lastTime = performance.now()
const loop = (time: number) => {
  const dt = Math.min(0.033, (time - lastTime) / 1000)
  lastTime = time
  update(dt)
  render()
  requestAnimationFrame(loop)
}

difficultySelect.value = currentDifficulty.name
setupModifierModeOptions()
setupTargetScoreOptions()

difficultySelect.addEventListener('change', () => {
  const next = difficultyPresets[difficultySelect.value]
  if (!next) return
  currentDifficulty = next
  aiTargetY = gameHeight / 2
  aiReactionTimer = 0
})

modifierModeSelect.addEventListener('change', () => {
  const nextSelection = modifierModeSelect.value as ModifierSelection
  selectedModifierMode = nextSelection === 'Random' ? 'Random' : (nextSelection as MatchModifier)

  if (gameState === 'playing' || gameState === 'paused') {
    resolveModifierForRound()
    applyModifierSetup()
    showToast(`Modifier set: ${activeModifier}`)
    updateHud()
  }
})

targetScoreSelect.addEventListener('change', () => {
  const parsed = Number.parseInt(targetScoreSelect.value, 10)
  targetScore = clampTargetScore(Number.isNaN(parsed) ? SCORE_LIMITS.default : parsed)
  targetScoreSelect.value = String(targetScore)
})

speedRampToggle.addEventListener('change', () => {
  speedRampEnabled = speedRampToggle.checked
})

muteToggle.addEventListener('change', () => {
  audioState.muted = muteToggle.checked
})

trailsToggle.addEventListener('change', () => {
  trailsEnabled = trailsToggle.checked
})

window.addEventListener('resize', resize)

canvas.addEventListener('mousemove', (event) => {
  const rect = canvas.getBoundingClientRect()
  mouseY = event.clientY - rect.top
  mouseAssistTimer = 0.35
})

canvas.addEventListener('mouseleave', () => {
  mouseY = null
})

canvas.addEventListener('pointerdown', (event) => {
  ensureAudio()

  if (event.pointerType === 'touch') {
    activeTouchIds.add(event.pointerId)
    if (activeTouchPointerId === null) {
      activeTouchPointerId = event.pointerId
      mouseY = event.clientY
      mouseAssistTimer = 0.5
    }
  }

  if (gameState === 'splash') {
    splashTime = Math.max(splashTime, splashConfig.animDuration + splashConfig.pauseDuration)
    return
  }

  if (gameState === 'postmatch') {
    return
  }

  if (gameState === 'paused') {
    gameState = 'playing'
    syncOverlayVisibility()
    return
  }

  if (gameState === 'playing') {
    if (event.pointerType === 'touch' && activeTouchIds.size >= 2) {
      gameState = 'paused'
      syncOverlayVisibility()
      showToast('Paused')
    }
  }
})

canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'touch') {
    if (activeTouchPointerId !== event.pointerId || gameState !== 'playing') return
    mouseY = event.clientY
    mouseAssistTimer = 0.5
  }
})

canvas.addEventListener('pointerup', (event) => {
  if (event.pointerType === 'touch') {
    activeTouchIds.delete(event.pointerId)
    if (activeTouchPointerId === event.pointerId) {
      activeTouchPointerId = null
      mouseY = null
      mouseAssistTimer = 0
    }
  }
})

canvas.addEventListener('pointercancel', (event) => {
  if (event.pointerType === 'touch') {
    activeTouchIds.delete(event.pointerId)
    if (activeTouchPointerId === event.pointerId) {
      activeTouchPointerId = null
      mouseY = null
      mouseAssistTimer = 0
    }
  }
})

window.addEventListener('keydown', (event) => {
  keys.add(event.code)

  if (event.code === 'KeyG' && gameState === 'playing') {
    gravityEnabled = !gravityEnabled
    showToast(`Gravity ${gravityEnabled ? 'ON' : 'OFF'}`)
  }

  if (event.code === 'Space') {
    if (gameState === 'splash') {
      splashTime = Math.max(splashTime, splashConfig.animDuration + splashConfig.pauseDuration)
    } else if (gameState !== 'postmatch') {
      togglePause()
    }
  }

  if (event.code === 'Enter') {
    if (gameState === 'splash') {
      splashTime = Math.max(splashTime, splashConfig.animDuration + splashConfig.pauseDuration)
    } else if (gameState === 'postmatch') {
      if (postMatch) postMatch.classList.add('hidden')
      startMatch()
    }
  }

  ensureAudio()
})

window.addEventListener('keyup', (event) => {
  keys.delete(event.code)
})

if (rematchBtn) {
  rematchBtn.addEventListener('click', () => {
    if (postMatch) postMatch.classList.add('hidden')
    startMatch()
  })
}

resize()
resetBall(ball, serveDirection)
syncOverlayVisibility()
updateHud()
requestAnimationFrame(loop)
