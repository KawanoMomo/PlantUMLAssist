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
// A request whose text starts with BASEDIR_MAGIC + folder + newline is read with that
// folder as the current directory, so a relative `!include` / `!includesub` resolves next
// to the .puml it was written in (the rest may start with PREPROC_MAGIC).
// The daemon exits when stdin reaches EOF (parent closed the pipe).

import net.sourceforge.plantuml.SourceStringReader;
import net.sourceforge.plantuml.FileFormat;
import net.sourceforge.plantuml.FileFormatOption;
import net.sourceforge.plantuml.BlockUml;
import net.sourceforge.plantuml.text.StringLocated;
import net.sourceforge.plantuml.security.SFile;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.EOFException;
import java.io.File;
import java.nio.charset.StandardCharsets;

public class PlantUMLDaemon {
    static final String PREPROC_MAGIC = "\u0000PREPROC\n";
    static final String BASEDIR_MAGIC = "\u0000BASEDIR ";

    static SourceStringReader reader(String dsl, File baseDir) {
        if (baseDir == null) return new SourceStringReader(dsl);
        return new SourceStringReader(dsl, SFile.fromFile(baseDir));
    }

    static byte[] preproc(String dsl, File baseDir) {
        SourceStringReader reader = reader(dsl, baseDir);
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
                File baseDir = null;
                if (dsl.startsWith(BASEDIR_MAGIC)) {
                    int nl = dsl.indexOf('\n');
                    if (nl < 0) throw new IllegalStateException("BASEDIR without newline");
                    baseDir = new File(dsl.substring(BASEDIR_MAGIC.length(), nl));
                    dsl = dsl.substring(nl + 1);
                }
                if (dsl.startsWith(PREPROC_MAGIC)) {
                    byte[] text = preproc(dsl.substring(PREPROC_MAGIC.length()), baseDir);
                    out.writeInt(0);
                    out.writeInt(text.length);
                    out.write(text);
                    out.flush();
                    continue;
                }
                SourceStringReader reader = reader(dsl, baseDir);
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
