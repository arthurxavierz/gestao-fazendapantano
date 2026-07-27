import { Camera, ChevronRight, MapPin, Scale } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Animal } from '../types'
import { formatWeight, sexLabel } from '../utils/format'
import { StatusBadge } from './StatusBadge'

export function AnimalCard({ animal }: { animal: Animal }) {
  return (
    <Link to={`/animais/${animal.id}`} className="animal-card">
      <div className="animal-photo">
        {animal.photo_url ? <img src={animal.photo_url} alt={`Animal ${animal.number}`} /> : <Camera size={24} />}
      </div>
      <div className="animal-card-body">
        <div className="animal-card-title">
          <div><span>Animal</span><strong>{animal.number}</strong></div>
          <StatusBadge status={animal.status} />
        </div>
        <div className="animal-meta">
          <span>{sexLabel[animal.sex]}{animal.breed ? `, ${animal.breed}` : ''}</span>
          <span><Scale size={15} /> {formatWeight(animal.weight)}</span>
          <span><MapPin size={15} /> {animal.lot || 'Local não informado'}</span>
        </div>
      </div>
      <ChevronRight className="animal-chevron" size={20} />
    </Link>
  )
}
