import { isSupabaseConfigured } from './services/supabase'

/**
 * Identidade exibida no sistema.
 *
 * Conectado ao banco de uma fazenda, mostra o nome dela (VITE_FARM_NAME, com
 * "Fazenda Pântano" como padrão). Em modo demonstração, mostra o produto da
 * Achilles, para apresentações e vídeos não apontarem para um cliente real.
 */
export interface BrandConfig {
  /** Nome curto na barra lateral, no título da aba e nos documentos. */
  name: string
  /** Linha de apoio abaixo do nome. */
  tagline: string
  /** Título do painel inicial. */
  heroTitle: string
  /** Título da tela de entrada. */
  loginTitle: string
  /** Cabeçalho dos PDFs e documentos Word. */
  documentHeader: string
  /** Marca da Achilles (imagens em /brand). Ausente no modo fazenda. */
  achilles: boolean
}

const farmName = (import.meta.env.VITE_FARM_NAME as string | undefined)?.trim() || 'Fazenda Pântano'

export const brand: BrandConfig = isSupabaseConfigured
  ? {
      name: farmName,
      tagline: 'Gestão pecuária',
      heroTitle: `${farmName} em números`,
      loginTitle: `Entrar na ${farmName}`,
      documentHeader: farmName,
      achilles: false
    }
  : {
      name: 'Achilles',
      tagline: 'Gestão Pecuária',
      heroTitle: 'Seu rebanho em números',
      loginTitle: 'Entrar na Gestão Pecuária',
      documentHeader: 'Achilles · Gestão Pecuária',
      achilles: true
    }
