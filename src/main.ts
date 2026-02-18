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
type MatchModifier = 'Curve Drift' | 'Big Ball' | 'Sticky Paddle' | 'Ion Wind'

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

const TARGET_SCORE = 7
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
        <option value="Easy">Easy</option>
        <option value="Challenging" selected>Challenging</option>
        <option value="Hard">Hard</option>
      </select>
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

if (!canvas || !difficultySelect || !muteToggle || !trailsToggle) {
  throw new Error('Required UI elements are missing')
}
const ctx = canvas.getContext('2d')
if (!ctx) {
  throw new Error('2D context not available')
}

const difficultyPresets: Record<string, Difficulty> = {
  Easy: { name: 'Easy', reactionMs: 180, maxSpeed: 380, errorPx: 40 },
  Challenging: { name: 'Challenging', reactionMs: 120, maxSpeed: 520, errorPx: 22 },
  Hard: { name: 'Hard', reactionMs: 80, maxSpeed: 680, errorPx: 10 },
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

let currentDifficulty = difficultyPresets.Challenging
let trailsEnabled = true
let gravityEnabled = true
let activeModifier: MatchModifier = 'Curve Drift'
let lastModifier: MatchModifier | null = null

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
const ball: Ball = {
  x: gameWidth / 2,
  y: gameHeight / 2,
  vx: baseBallSpeed,
  vy: 0,
  radius: 9,
}

const trail: Array<{ x: number; y: number }> = []
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
  const modifiers: MatchModifier[] = ['Curve Drift', 'Big Ball', 'Sticky Paddle', 'Ion Wind']
  const filtered = modifiers.filter((modifier) => modifier !== lastModifier)
  const picked = filtered[Math.floor(Math.random() * filtered.length)]
  lastModifier = picked
  return picked
}

const updateWellPositions = () => {
  gravityWells[0].x = gameWidth * 0.32
  gravityWells[0].y = gameHeight * 0.38
  gravityWells[1].x = gameWidth * 0.68
  gravityWells[1].y = gameHeight * 0.62
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

const resetBall = (direction: 1 | -1) => {
  ball.x = gameWidth / 2
  ball.y = gameHeight / 2
  const angle = (Math.random() * 0.52 - 0.26) * Math.PI
  ball.vx = Math.cos(angle) * baseBallSpeed * direction
  ball.vy = Math.sin(angle) * baseBallSpeed
  ball.radius = activeModifier === 'Big Ball' ? 13 : 9
}

const startServe = (direction: 1 | -1) => {
  serveDirection = direction
  serveTimer = 0.55
  stickyTimer = 0
  stickyPaddle = null
  resetBall(direction)
}

const applyModifierSetup = () => {
  modifierClock = 0
  stickyTimer = 0
  stickyPaddle = null
  ball.radius = activeModifier === 'Big Ball' ? 13 : 9
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
  activeModifier = chooseModifier()
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

const scorePoint = (scorer: 'player' | 'ai') => {
  if (scorer === 'player') {
    playerScore += 1
  } else {
    aiScore += 1
  }

  playScore()
  scorePulseTimer = 0.4
  shakeTimer = 0.2
  shakeStrength = 13
  spawnParticles(ball.x, ball.y, 22, 220, scorer === 'player' ? '255, 214, 155' : '125, 214, 255')

  rallyCount = 0

  if (playerScore >= TARGET_SCORE || aiScore >= TARGET_SCORE) {
    endMatch(playerScore > aiScore ? 'player' : 'ai')
    return
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
}

const attachStickyBall = (paddle: Paddle) => {
  stickyPaddle = paddle
  stickyTimer = 0.09
  stickyOffsetY = clamp(ball.y - (paddle.y + paddle.height / 2), -paddle.height * 0.42, paddle.height * 0.42)
}

const applyPaddleCollision = (paddle: Paddle) => {
  const withinX = ball.x + ball.radius > paddle.x && ball.x - ball.radius < paddle.x + paddle.width
  const withinY = ball.y + ball.radius > paddle.y && ball.y - ball.radius < paddle.y + paddle.height
  if (!withinX || !withinY) return false

  if (ball.vx < 0 && paddle === player) {
    ball.x = paddle.x + paddle.width + ball.radius
  } else if (ball.vx > 0 && paddle === ai) {
    ball.x = paddle.x - ball.radius
  } else {
    return false
  }

  ball.vx *= -1
  const offset = (ball.y - (paddle.y + paddle.height / 2)) / (paddle.height / 2)
  ball.vy += offset * 250
  ball.vx = clamp(ball.vx, -920, 920)
  ball.vy = clamp(ball.vy, -920, 920)

  registerPaddleHit()

  if (activeModifier === 'Sticky Paddle') {
    attachStickyBall(paddle)
  }

  return true
}

const applyGravity = (dt: number) => {
  if (!gravityEnabled) return

  for (const well of gravityWells) {
    const dx = well.x - ball.x
    const dy = well.y - ball.y
    const dist2 = dx * dx + dy * dy
    const dist = Math.sqrt(dist2) || 1
    const dirX = dx / dist
    const dirY = dy / dist
    const force = well.strength / (dist2 + well.softening)
    ball.vx += dirX * force * dt
    ball.vy += dirY * force * dt
  }
}

const applyModifierForces = (dt: number) => {
  modifierClock += dt

  if (activeModifier === 'Curve Drift') {
    ball.vy += Math.sin(modifierClock * 5.4) * 70 * dt
  } else if (activeModifier === 'Ion Wind') {
    const wind = Math.sin(modifierClock * 1.8) * 120
    ball.vx += wind * dt
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

const updateAI = (dt: number) => {
  aiReactionTimer -= dt * 1000
  if (aiReactionTimer <= 0) {
    aiReactionTimer = currentDifficulty.reactionMs
    const error = (Math.random() * 2 - 1) * currentDifficulty.errorPx
    aiTargetY = ball.y + error
  }

  const centerY = ai.y + ai.height / 2
  const distance = aiTargetY - centerY
  const desiredSpeed = clamp(distance * 2.4, -currentDifficulty.maxSpeed, currentDifficulty.maxSpeed)
  const smoothing = 1 - Math.exp(-dt * 8)
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

  applyGravity(dt)
  applyModifierForces(dt)

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

  if (!applyPaddleCollision(player)) {
    applyPaddleCollision(ai)
  }

  if (ball.x + ball.radius < 0) {
    scorePoint('ai')
  } else if (ball.x - ball.radius > gameWidth) {
    scorePoint('player')
  }

  const speed = Math.hypot(ball.vx, ball.vy)
  const dynamicTrail = Math.floor(9 + clamp(speed / 45, 0, 20) + clamp(rallyCount * 0.7, 0, 14))
  trail.push({ x: ball.x, y: ball.y })
  while (trail.length > dynamicTrail) {
    trail.shift()
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
  trail.forEach((point, index) => {
    const alpha = (index + 1) / trail.length
    const radius = ball.radius * (0.42 + alpha * 0.45)
    ctx.fillStyle = `rgba(${currentCosmetic.trailColor}, ${alpha * 0.25 * speedIntensity})`
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

const renderBall = () => {
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
  renderParticles()
  renderPaddles()
  renderBall()
  renderScore()
  renderStatus()
  renderServe()
  renderSplash()
  renderPause()
  ctx.restore()
}

const update = (dt: number) => {
  if (gameState === 'playing') {
    updatePlayer(dt)
    updateAI(dt)
    updateBall(dt)
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
difficultySelect.addEventListener('change', () => {
  const next = difficultyPresets[difficultySelect.value]
  if (!next) return
  currentDifficulty = next
  aiTargetY = gameHeight / 2
  aiReactionTimer = 0
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
resetBall(serveDirection)
syncOverlayVisibility()
updateHud()
requestAnimationFrame(loop)
