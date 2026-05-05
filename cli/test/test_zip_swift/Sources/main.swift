// The Swift Programming Language
// https://docs.swift.org/swift-book

import ArgumentParser
import Foundation
import ZipArchive
import Darwin

extension URL {
    var isDirectory: Bool {
        (try? resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true
    }
    var exist: Bool {
        return FileManager().fileExists(atPath: self.path)
    }
}


func verifyZipFile(zipFilePath: String) {
    let destUnZip = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("extracted")

    var unzipError: NSError?
    let success = SSZipArchive.unzipFile(atPath: zipFilePath,
         toDestination: destUnZip.path,
         preserveAttributes: true,
         overwrite: true,
         nestedZipLevel: 1,
         password: nil,
         error: &unzipError,
         delegate: nil,
         progressHandler: { (entry, _, _, _) in
            if entry.contains("\\") {
                print("Windows path is not supported: \(entry)")
                exit(1)
            }

            let fileURL = destUnZip.appendingPathComponent(entry)
            let canonicalPath = fileURL.path
            let canonicalDir = destUnZip.path

            if !canonicalPath.hasPrefix(canonicalDir) {
                print("SecurityException, Failed to ensure directory is the start path: \(canonicalDir) of \(canonicalPath)")
                exit(1)
            }
         },
         completionHandler: nil)

    if !success || unzipError != nil {
        print("Failed to unzip file: \(zipFilePath)")
        print("Error: \(unzipError?.localizedDescription ?? "")")
        exit(1)
    }

    print("ZIP file is valid: \(zipFilePath)")
}

@main
struct CapgoCliTest: ParsableCommand {
    @Option(parsing: .upToNextOption, help: "Specify the files to test")
  public var zipFiles: [String]

  public func run() throws {
    print("Hello capgo test", zipFiles)
      
      for file in zipFiles {
          guard let fileUrl =  URL(string: file) else {
              print("Cannot convert \"\(file)\" into a file")
              Darwin.exit(1)
          }
          
          if (!fileUrl.exist) {
              print("File \"\(fileUrl)\" does not exist")
              Darwin.exit(1)
          }
          
        print("Testing file \(file)")
        verifyZipFile(zipFilePath: file)
      }
  }
}
