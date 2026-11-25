package expo.modules.mymodule

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.exception.CodedException

class MyModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MyModule")

    AsyncFunction("encodeBgraToJpegAsync") { _: ByteArray, _: Int, _: Int, _: Double ->
      throw CodedException("UNSUPPORTED", "Frame JPEG encoding is iOS-only in this app")
    }
  }
}