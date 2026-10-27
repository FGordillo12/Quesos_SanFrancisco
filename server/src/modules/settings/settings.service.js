import { CompanySettings } from './models/CompanySettings.js'

export const defaultCompanySettings = Object.freeze({
  _id: 'company',
  name: 'Quesos San Francisco',
  location: 'Ubaté, Vereda Soaga, Cundinamarca, Colombia',
  nit: '',
  phone: '',
  email: '',
  representative: '',
  printProfile: { format: 'letter', marginMm: 10, fontSize: 9, showLogo: true },
})

export async function getOrCreateCompanySettings() {
  return CompanySettings.findOneAndUpdate(
    { _id: 'company' },
    { $setOnInsert: defaultCompanySettings },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
}
