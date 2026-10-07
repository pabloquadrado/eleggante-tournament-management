/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'

const PublicTournamentsController = () => import('#controllers/public-tournaments-controller')
const IdentityController = () => import('#controllers/identity-controller')

router.get('/sign-in', [IdentityController, 'signIn'])
router.get('/sign-in/code', [IdentityController, 'codePage'])
router.get('/onboarding', [IdentityController, 'profilePage']).as('onboarding.page')
router.get('/me', [IdentityController, 'profilePage']).as('profile.page')

router.post('/api/v1/auth/otp/request', [IdentityController, 'request'])
router.get('/api/v1/auth/otp/:id', [IdentityController, 'status'])
router.post('/api/v1/auth/otp/verify', [IdentityController, 'verify'])
router.post('/api/v1/auth/logout', [IdentityController, 'logout'])
router.get('/api/v1/onboarding/profile', [IdentityController, 'onboardingProfile'])
router.patch('/api/v1/onboarding/profile', [IdentityController, 'updateOnboardingProfile'])
router.post('/api/v1/onboarding/profile/phone/verify', [
  IdentityController,
  'confirmOnboardingPhone',
])
router.post('/api/v1/onboarding/profile/phone/cancel', [
  IdentityController,
  'cancelOnboardingPhone',
])
router.get('/api/v1/me', [IdentityController, 'profile'])
router.patch('/api/v1/me', [IdentityController, 'updateProfile'])
router.post('/api/v1/me/phone/verify', [IdentityController, 'confirmPhone'])
router.post('/api/v1/me/phone/cancel', [IdentityController, 'cancelPhone'])

router.get('/', ({ response }) => response.redirect('/tournaments'))
router.get('/tournaments', [PublicTournamentsController, 'index'])
router.get('/tournaments/:id', [PublicTournamentsController, 'show'])
router.get('/api/v1/tournaments', [PublicTournamentsController, 'apiIndex'])
router.get('/api/v1/tournaments/:id', [PublicTournamentsController, 'apiShow'])

if (process.env.NODE_ENV === 'test') {
  router.get('/__test__/server-error', () => {
    throw new Error('Test server error')
  })
}
