import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole } from '../auth/auth.middleware.js'
import { CompanySettings } from './models/CompanySettings.js'
import { getOrCreateCompanySettings } from './settings.service.js'

export const settingsRouter = Router()
const settingsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  location: z.string().trim().min(2).max(240),
  nit: z.string().trim().max(30).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
  email: z.union([z.string().trim().email().max(254), z.literal('')]).optional().default(''),
  representative: z.string().trim().max(120).optional().default(''),
  printProfile: z.object({
    format: z.enum(['letter', 'thermal80', 'thermal58']),
    marginMm: z.number().min(0).max(25),
    fontSize: z.number().min(8).max(14),
    showLogo: z.boolean(),
  }).strict(),
}).strict()

function parseSettings(req, res, next) {
  const result = settingsSchema.safeParse(req.body)
  if (!result.success) return res.status(400).json({ ok: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Revisa los datos ingresados.' } })
  req.settingsInput = result.data
  return next()
}

function publicSettings(document) {
  const data = document.toObject ? document.toObject() : { ...document }
  delete data.driveOAuth
  return data
}

settingsRouter.use(requireAuth)
settingsRouter.get('/company', requireRole('admin'), async (req, res, next) => {
  try {
    const data = await getOrCreateCompanySettings()
    return res.json({ ok: true, data: publicSettings(data), error: null })
  } catch (error) { return next(error) }
})

settingsRouter.put('/company', requireRole('admin'), parseSettings, async (req, res, next) => {
  try {
    const data = await CompanySettings.findOneAndUpdate(
      { _id: 'company' },
      { $set: { ...req.settingsInput, updatedBy: req.authUser._id } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    )
    return res.json({ ok: true, data: publicSettings(data), error: null })
  } catch (error) { return next(error) }
})
