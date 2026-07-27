import { useCallback, useEffect, useState } from 'react'
import { listProfiles } from '../services/repository'
import type { Profile } from '../types'

/**
 * Traduz o id de quem registrou para um nome legível.
 *
 * Só busca as contas quando `enabled` é verdadeiro, ou seja, quando um
 * administrador está na tela. O operador nunca dispara esta consulta — e mesmo
 * que disparasse, a política do banco devolveria apenas a própria conta.
 */
export function useResponsibleName(enabled: boolean) {
  const [profiles, setProfiles] = useState<Profile[]>([])

  useEffect(() => {
    if (!enabled) return
    let active = true
    listProfiles()
      .then((data) => { if (active) setProfiles(data) })
      .catch(() => { if (active) setProfiles([]) })
    return () => { active = false }
  }, [enabled])

  return useCallback(
    (id?: string | null) => {
      if (!id) return 'Não identificado'
      const found = profiles.find((item) => item.id === id)
      return found?.full_name || found?.email || 'Conta removida'
    },
    [profiles]
  )
}
