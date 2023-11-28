import { ZodTypeAny } from 'zod';
 
declare global {
    namespace PlaywrightTest {
        interface Matchers<R, T> {
            toMatchSchema(schema: ZodTypeAny): Promise<R>;
            toHaveError(error: string): Promise<R>
        }
    }
}