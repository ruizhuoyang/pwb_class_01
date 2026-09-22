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
      setMessage(error instanceof Error ? error.message : '操作失败，请重试。')
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
            setMessage('地形参数已保存')
          })}>保存参数</button>
          <button disabled={busy} onClick={() => run(async () => {
            const snapshot = await getDoc(doc(currentDb, 'users', user.uid, 'configs', 'main'))
            if (!snapshot.exists()) { setMessage('还没有保存的参数'); return }
            const saved = snapshot.data().scene
            if (!validScene(saved)) throw new Error('保存的数据格式不正确')
            onLoadScene(saved)
            setMessage('地形参数已载入')
          })}>载入参数</button>
          <button disabled={busy} onClick={() => run(() => signOut(currentAuth))}>退出</button>
        </>
      ) : (
        <button disabled={busy} onClick={() => run(async () => { await signInWithPopup(currentAuth, new GoogleAuthProvider()) })}>
          使用 Google 登录
        </button>
      )}
      {message && <span className="firebase-controls__message" role="status">{message}</span>}
    </div>
  )
}
