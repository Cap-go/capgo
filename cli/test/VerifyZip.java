import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.BufferedInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class VerifyZip {
    public static void main(String[] args) {
        if (args.length < 1) {
            System.out.println("Usage: java VerifyZip <zip-file>");
            System.exit(1);
        }

        String zipFilePath = args[0];
        File zipFile = new File(zipFilePath);
        File targetDirectory = new File("extracted");

        if (!zipFile.exists()) {
            System.out.println("File not found: " + zipFilePath);
            System.exit(1);
        }

        try (
            BufferedInputStream bis = new BufferedInputStream(new FileInputStream(zipFile));
            ZipInputStream zis = new ZipInputStream(bis)
        ) {
            int count;
            int bufferSize = 8192;
            byte[] buffer = new byte[bufferSize];
            long lengthTotal = zipFile.length();
            long lengthRead = bufferSize;
            int percent = 0;

            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                if (entry.getName().contains("\\")) {
                    System.out.println("Windows path is not supported: " + entry.getName());
                    System.exit(1);
                }
                File file = new File(targetDirectory, entry.getName());
                String canonicalPath = file.getCanonicalPath();
                String canonicalDir = targetDirectory.getCanonicalPath();
                File dir = entry.isDirectory() ? file : file.getParentFile();

                if (!canonicalPath.startsWith(canonicalDir)) {
                    System.out.println("SecurityException, Failed to ensure directory is the start path: " +
                            canonicalDir + " of " + canonicalPath);
                    System.exit(1);
                }

                if (!dir.isDirectory() && !dir.mkdirs()) {
                    System.out.println("Failed to ensure directory: " + dir.getAbsolutePath());
                    System.exit(1);
                }

                if (entry.isDirectory()) {
                    continue;
                }

                try (FileOutputStream outputStream = new FileOutputStream(file)) {
                    while ((count = zis.read(buffer)) != -1) {
                        outputStream.write(buffer, 0, count);
                    }
                }

                int newPercent = (int) ((lengthRead / (float) lengthTotal) * 100);
                if (lengthTotal > 1 && newPercent != percent) {
                    percent = newPercent;
                }

                lengthRead += entry.getCompressedSize();
            }
            System.out.println("ZIP file is valid: " + zipFilePath);
        } catch (IOException e) {
            System.out.println("Failed to process ZIP file: " + zipFilePath);
            e.printStackTrace();
            System.exit(1);
        }
    }
}
