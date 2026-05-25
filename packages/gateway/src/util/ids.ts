import { randomBytes } from 'node:crypto'

// 64-bit random suffix → ~1.8 × 10¹⁹ space. Collision odds at 10⁹
// audit entries are still well under 10⁻¹². Math.random() (the
// previous source) is non-cryptographic and offers ~52 bits in
// practice, which becomes a real concern at audit-log scale.
export const auditId = (): string => `aud_${randomBytes(8).toString('hex')}`
