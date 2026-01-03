/**
 * Unit test for SSRF protection in SSO Management
 * This can be run independently without Supabase
 */

import { describe, expect, it } from 'vitest'

// Inline the validateMetadataURL function for unit testing
function validateMetadataURL(url: string): void {
    try {
        const parsed = new URL(url)

        // Only allow https:// for security
        if (parsed.protocol !== 'https:') {
            throw new Error('SSRF protection: Metadata URL must use HTTPS')
        }

        // Block internal/localhost addresses
        const hostname = parsed.hostname.toLowerCase()
        const blockedHosts = [
            'localhost',
            '127.0.0.1',
            '0.0.0.0',
            '::1',
            '169.254.169.254', // AWS metadata service
            '169.254.169.253', // AWS ECS metadata
        ]

        if (blockedHosts.includes(hostname)) {
            throw new Error('SSRF protection: Cannot use internal/localhost addresses')
        }

        // Block private IP ranges
        if (
            hostname.startsWith('10.')
            || hostname.startsWith('192.168.')
            || hostname.match(/^172\.(?:1[6-9]|2\d|3[01])\./)
        ) {
            throw new Error('SSRF protection: Cannot use private IP addresses')
        }
    }
    catch (error) {
        if (error instanceof TypeError) {
            throw new Error('Invalid URL format')
        }
        throw error
    }
}

describe('sso SSRF Protection Unit Tests', () => {
    const dangerousUrls = [
        'http://localhost:8080/metadata',
        'http://127.0.0.1:8080/metadata',
        'http://169.254.169.254/latest/meta-data/',
        'http://10.0.0.1/metadata',
        'http://192.168.1.1/metadata',
        'http://172.16.0.1/metadata',
        'http://172.20.0.1/metadata',
        'http://172.31.255.255/metadata',
    ]

    dangerousUrls.forEach((url) => {
        it(`should reject SSRF attempt with ${url}`, () => {
            expect(() => validateMetadataURL(url)).toThrow('SSRF protection')
        })
    })

    it('should accept valid HTTPS metadata URL', () => {
        expect(() => validateMetadataURL('https://example.com/saml/metadata')).not.toThrow()
        expect(() => validateMetadataURL('https://auth.example.com/metadata.xml')).not.toThrow()
    })

    it('should reject URLs with invalid format', () => {
        expect(() => validateMetadataURL('not-a-url')).toThrow('Invalid URL format')
    })

    it('should reject HTTP URLs (not HTTPS)', () => {
        expect(() => validateMetadataURL('http://example.com/metadata')).toThrow('SSRF protection: Metadata URL must use HTTPS')
    })

    it('should block localhost variants', () => {
        expect(() => validateMetadataURL('https://localhost/metadata')).toThrow('internal/localhost')
        expect(() => validateMetadataURL('https://127.0.0.1/metadata')).toThrow('internal/localhost')
        expect(() => validateMetadataURL('https://0.0.0.0/metadata')).toThrow('internal/localhost')
    })

    it('should block AWS metadata service', () => {
        expect(() => validateMetadataURL('https://169.254.169.254/latest')).toThrow('internal/localhost')
    })

    it('should block private IP ranges', () => {
        expect(() => validateMetadataURL('https://10.0.0.1/metadata')).toThrow('private IP')
        expect(() => validateMetadataURL('https://192.168.1.1/metadata')).toThrow('private IP')
        expect(() => validateMetadataURL('https://172.16.0.1/metadata')).toThrow('private IP')
        expect(() => validateMetadataURL('https://172.31.0.1/metadata')).toThrow('private IP')
    })

    it('should allow 172.15.x.x (not in private range)', () => {
        expect(() => validateMetadataURL('https://172.15.0.1/metadata')).not.toThrow()
    })

    it('should allow 172.32.x.x (not in private range)', () => {
        expect(() => validateMetadataURL('https://172.32.0.1/metadata')).not.toThrow()
    })
})
