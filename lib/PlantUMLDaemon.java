// PlantUMLDaemon — long-running JVM that renders PlantUML DSL via stdin/stdout.
// Avoids the ~1s JVM startup penalty of `java -jar plantuml.jar -pipe` per render.
// No sockets are opened: communication is strictly through the parent's pipes,
// so the daemon cannot be reached from the network.
//
// Wire protocol (all big-endian):
//   Request  : [int32 dsl_byte_length][utf8 bytes]
//   Response : [int32 status][int32 body_length][bytes]
//     status = 0  -> body is SVG
//     status = 1  -> body is UTF-8 error message
// A request whose text starts with PREPROC_MAGIC is not drawn: the answer is the
// first diagram's lines after PlantUML's own preprocessor (!procedure / !definelong /
// !include / variables expanded), one per line, as UTF-8 text (status 0).
// The daemon exits when stdin reaches EOF (parent closed the pipe).

import net.sourceforge.plantuml.SourceStringReader;
import net.sourceforge.plantuml.FileFormat;
import net.sourceforge.plantuml.FileFormatOption;
import net.sourceforge.plantuml.BlockUml;
import net.sourceforge.plantuml.text.StringLocated;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.EOFException;
import java.nio.charset.StandardCharsets;

public class PlantUMLDaemon {
    static final String PREPROC_MAGIC = "\u0000PREPROC\n";

    static byte[] preproc(String dsl) {
        SourceStringReader reader = new SourceStringReader(dsl);
        if (reader.getBlocks().isEmpty()) throw new IllegalStateException("no @startuml block");
        BlockUml block = reader.getBlocks().get(0);
        StringBuilder sb = new StringBuilder();
        for (StringLocated s : block.getData()) {
            if (s.getPreprocessorError() != null)
                throw new IllegalStateException("preprocessor: " + s.getPreprocessorError());
            sb.append(s.getString()).append('\n');
        }
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    public static void main(String[] args) throws Exception {
        DataInputStream in = new DataInputStream(System.in);
        DataOutputStream out = new DataOutputStream(System.out);
        while (true) {
            int len;
            try {
                len = in.readInt();
            } catch (EOFException e) {
                return;
            }
            byte[] buf = new byte[len];
            in.readFully(buf);
            String dsl = new String(buf, StandardCharsets.UTF_8);
            try {
                if (dsl.startsWith(PREPROC_MAGIC)) {
                    byte[] text = preproc(dsl.substring(PREPROC_MAGIC.length()));
                    out.writeInt(0);
                    out.writeInt(text.length);
                    out.write(text);
                    out.flush();
                    continue;
                }
                SourceStringReader reader = new SourceStringReader(dsl);
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                reader.outputImage(baos, new FileFormatOption(FileFormat.SVG));
                byte[] svg = baos.toByteArray();
                out.writeInt(0);
                out.writeInt(svg.length);
                out.write(svg);
            } catch (Throwable t) {
                byte[] msg = (t.getClass().getSimpleName() + ": " + t.getMessage())
                        .getBytes(StandardCharsets.UTF_8);
                out.writeInt(1);
                out.writeInt(msg.length);
                out.write(msg);
            }
            out.flush();
        }
    }
}
