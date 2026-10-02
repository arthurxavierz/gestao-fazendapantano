import { Camera, ChevronRight, MapPin, Scale } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useHerd } from '../hooks/useHerd'
import type { Animal } from '../types'
import { categoryLabel, formatAge, formatWeight, sexLabel } from '../utils/format'
import { ReproBadge, StatusBadge } from './StatusBadge'

export function AnimalCard({ animal }: { animal: Animal }) {
  const herd = useHerd()
  const info = herd.get(animal.id)
  const category = info?.category

  return (
    <Link to={`/animais/${animal.id}`} className="animal-card">
      <div className="animal-photo">
        {animal.photo_url ? <img src={animal.photo_url} alt={`Animal ${animal.number}`} loading="lazy" /> : <Camera size={22} />}
      </div>
      <div className="animal-card-body">
        <div className="animal-card-title">
          <div><span>{category ? categoryLabel[category] : 'Animal'}</span><strong>{animal.number}</strong></div>
          <div className="animal-card-badges">
            {animal.status !== 'normal' && <StatusBadge status={animal.status} />}
            {info?.breeding && info.state !== 'descarte' && <ReproBadge state={info.state} />}
            {animal.status === 'normal' && !info?.breeding && <StatusBadge status={animal.status} />}
          </div>
        </div>
        <div className="animal-meta">
          <span>{sexLabel[animal.sex]}{animal.breed ? ` · ${animal.breed}` : ''}{animal.birth_date ? ` · ${formatAge(animal.birth_date)}` : ''}</span>
          <span><Scale size={14} /> {formatWeight(animal.weight)}</span>
          <span><MapPin size={14} /> {animal.lot || 'Local não informado'}</span>
        </div>
      </div>
      <ChevronRight className="animal-chevron" size={20} />
    </Link>
  )
}
