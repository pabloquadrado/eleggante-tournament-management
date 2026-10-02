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
