import { useEffect, useState } from 'react'
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db, firebaseReady } from '../firebase'
import type { SceneParams } from './ThreeCanvas'
import './FirebaseControls.css'

type Props = {
  scene: SceneParams
  onLoadScene: (scene: SceneParams) => void
}

function validScene(value: unknown): value is SceneParams {
  if (!value || typeof value !== 'object') return false
  const s = value as Record<string, unknown>
  return typeof s.planeSegments === 'number' && s.planeSegments >= 4 && s.planeSegments <= 1024
    && typeof s.noiseFieldSize === 'number' && s.noiseFieldSize >= 32 && s.noiseFieldSize <= 1024
    && typeof s.displacementScale === 'number' && s.displacementScale >= 0 && s.displacementScale <= 6
    && typeof s.fog === 'boolean'
}

export default function FirebaseControls({ scene, onLoadScene }: Props) {
  const [user, setUser] = useState<User | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, setUser)
  }, [])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setMessage('')
    try {
      await action()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Operation failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!firebaseReady || !auth || !db) return null
  const currentAuth = auth
  const currentDb = db

  return (
    <div className="firebase-controls">
      {user ? (
        <>
          <span className="firebase-controls__user" title={user.email ?? ''}>{user.displayName ?? user.email}</span>
          <button disabled={busy} onClick={() => run(async () => {
            await setDoc(doc(currentDb, 'users', user.uid, 'configs', 'main'), {
              scene: { ...scene }, updatedAt: serverTimestamp(),
            })
            setMessage('Terrain settings saved.')
          })}>Save</button>
          <button disabled={busy} onClick={() => run(async () => {
            const snapshot = await getDoc(doc(currentDb, 'users', user.uid, 'configs', 'main'))
            if (!snapshot.exists()) { setMessage('No saved terrain settings yet.'); return }
            const saved = snapshot.data().scene
            if (!validScene(saved)) throw new Error('Saved terrain settings have an invalid format.')
            onLoadScene(saved)
            setMessage('Terrain settings loaded.')
          })}>Load</button>
          <button disabled={busy} onClick={() => run(() => signOut(currentAuth))}>Sign out</button>
        </>
      ) : (
        <button disabled={busy} onClick={() => run(async () => { await signInWithPopup(currentAuth, new GoogleAuthProvider()) })}>
          Sign in with Google
        </button>
      )}
      {message && <span className="firebase-controls__message" role="status">{message}</span>}
    </div>
  )
}
