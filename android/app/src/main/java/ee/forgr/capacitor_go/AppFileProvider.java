package ee.forgr.capacitor_go;

import androidx.core.content.FileProvider;

/**
 * App-specific FileProvider subclass.
 *
 * Using a distinct class name (instead of the bare androidx.core.content.FileProvider)
 * avoids an AndroidManifest merge collision with @capgo/capacitor-pdf-generator, which
 * declares its own androidx.core.content.FileProvider. The manifest merger keys providers
 * by android:name, so two providers sharing that name conflict on authorities/resource.
 *
 * FileProvider resolves by authority at runtime, not by class name, so this subclass is
 * transparent: Capacitor keeps using the ${applicationId}.fileprovider authority, and the
 * plugin keeps its own ${applicationId}.capgo.pdfgenerator.fileprovider authority. Both
 * providers coexist with their own file_paths resources.
 */
public class AppFileProvider extends FileProvider {
}
