context('Basic', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('is login page', () => {
    cy.url()
      .should('eq', 'http://localhost:5173/login')

    cy.contains('Welcome to Capgo !')
      .should('exist')

    cy.get('#input')
      .type('Vitesse{Enter}')
      .url()
      .should('eq', 'http://localhost:5173/hi/Vitesse')

    cy.contains('[Default Layout]')
      .should('exist')

    cy.get('.btn')
      .click()
      .url()
      .should('eq', 'http://localhost:5173/')
  })

  it('login fail', () => {
    cy.url()
      .should('eq', 'http://localhost:5173/login')

    cy.contains('Welcome to Capgo !')
      .should('exist')

    cy.get('#input')
      .type('Vitesse{Enter}')
      .url()
      .should('eq', 'http://localhost:5173/hi/Vitesse')

    cy.contains('[Default Layout]')
      .should('exist')

    cy.get('.btn')
      .click()
      .url()
      .should('eq', 'http://localhost:5173/')
  })

  it('login success', () => {
    cy.url()
      .should('eq', 'http://localhost:5173/login')

    cy.contains('[Home Layout]')
      .should('exist')

    cy.get('#input')
      .type('Vitesse{Enter}')
      .url()
      .should('eq', 'http://localhost:5173/hi/Vitesse')

    cy.contains('[Default Layout]')
      .should('exist')

    cy.get('.btn')
      .click()
      .url()
      .should('eq', 'http://localhost:5173/')
  })

  it('markdown', () => {
    cy.get('[title="About"]')
      .click()
      .url()
      .should('eq', 'http://localhost:5173/dashboard')

    cy.get('pre.language-js')
      .should('exist')
  })
})
