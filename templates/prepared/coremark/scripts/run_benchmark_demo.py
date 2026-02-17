#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path


TARGET = "linx64-linx-none-elf"


def _first_existing(paths: list[Path]) -> Path | None:
    for p in paths:
        if p.exists():
            return p
    return None


def _project_root(default_script: Path, explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).resolve()
    return default_script.resolve().parent.parent


def _tool_paths(home: Path) -> tuple[Path, Path, Path, Path, Path, Path]:
    clang = Path(os.environ.get("CLANG", home / "llvm-project" / "build-linxisa-clang" / "bin" / "clang"))
    lld = Path(os.environ.get("LLD", clang.parent / "ld.lld"))
    objcopy = Path(os.environ.get("OBJCOPY", clang.parent / "llvm-objcopy"))
    objdump = Path(os.environ.get("OBJDUMP", clang.parent / "llvm-objdump"))

    qemu = Path(
        os.environ.get(
            "QEMU",
            _first_existing(
                [
                    home / "qemu" / "build-linx" / "qemu-system-linx64",
                    home / "qemu" / "build" / "qemu-system-linx64",
                    home / "qemu" / "build-tci" / "qemu-system-linx64",
                ]
            )
            or "",
        )
    )

    linx_isa_root = Path(
        os.environ.get(
            "LINX_ISA_ROOT",
            _first_existing([home / "linx-isa", home / "linxisa"]) or "",
        )
    )

    return clang, lld, objcopy, objdump, qemu, linx_isa_root


def _check_exec(path: Path, label: str) -> None:
    if not path.exists():
        raise SystemExit(f"error: {label} not found: {path}")
    if not os.access(path, os.X_OK):
        raise SystemExit(f"error: {label} not executable: {path}")


def _run(cmd: list[str], cwd: Path | None = None, timeout: float | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
    )


def _compile_objects(clang: Path, output_dir: Path, sources: list[Path], flags: list[str], per_source_flags: dict[str, list[str]] | None = None) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    objects: list[Path] = []
    per_source_flags = per_source_flags or {}

    for src in sources:
        obj = output_dir / f"{src.stem}.o"
        extra = per_source_flags.get(src.name, [])
        cmd = [str(clang), *flags, *extra, "-c", str(src), "-o", str(obj)]
        p = _run(cmd)
        if p.returncode != 0:
            sys.stderr.write(p.stdout)
            sys.stderr.write(p.stderr)
            raise SystemExit(f"error: compile failed: {src}")
        if p.stdout:
            sys.stdout.write(p.stdout)
        if p.stderr:
            sys.stderr.write(p.stderr)
        objects.append(obj)

    return objects


def _build_runtime(project_root: Path, clang: Path, linx_isa_root: Path, benchmark_include_root: Path, include_linx_bench: Path, out_dir: Path) -> list[Path]:
    libc_include = linx_isa_root / "toolchain" / "libc" / "include"
    libc_src = linx_isa_root / "toolchain" / "libc" / "src"
    startup = linx_isa_root / "workloads" / "benchmarks" / "common" / "startup.c"

    if not libc_include.exists() or not libc_src.exists() or not startup.exists():
        raise SystemExit(
            "error: required runtime sources not found under LINX_ISA_ROOT. "
            "Set LINX_ISA_ROOT to your linx-isa checkout."
        )

    cflags = [
        "-target", TARGET,
        "-O2",
        "-ffreestanding",
        "-fno-builtin",
        "-fno-stack-protector",
        "-fno-asynchronous-unwind-tables",
        "-fno-unwind-tables",
        "-fno-exceptions",
        "-fno-jump-tables",
        "-nostdlib",
        f"-I{libc_include}",
        f"-I{benchmark_include_root}",
        f"-I{include_linx_bench}",
    ]

    runtime_sources = [
        startup,
        libc_src / "syscall.c",
        libc_src / "stdio" / "stdio.c",
        libc_src / "stdlib" / "stdlib.c",
        libc_src / "string" / "mem.c",
        libc_src / "string" / "str.c",
        libc_src / "math" / "math.c",
    ]
    return _compile_objects(clang, out_dir, runtime_sources, cflags)


def _build_coremark(project_root: Path, clang: Path, lld: Path, linx_isa_root: Path) -> Path:
    bench_root = project_root / "benchmarks" / "coremark"
    upstream = bench_root / "upstream"
    port = bench_root / "linx"
    if not upstream.exists() or not port.exists():
        raise SystemExit("error: coremark benchmark sources missing in project")

    build_dir = project_root / "build" / "coremark"
    obj_dir = build_dir / "obj"
    runtime_dir = build_dir / "runtime"
    build_dir.mkdir(parents=True, exist_ok=True)

    runtime_objs = _build_runtime(project_root, clang, linx_isa_root, linx_isa_root / "workloads" / "benchmarks", project_root / "benchmarks", runtime_dir)

    libc_include = linx_isa_root / "toolchain" / "libc" / "include"
    cflags = [
        "-target", TARGET,
        "-O2",
        "-ffreestanding",
        "-fno-builtin",
        "-fno-stack-protector",
        "-fno-asynchronous-unwind-tables",
        "-fno-unwind-tables",
        "-fno-exceptions",
        "-fno-jump-tables",
        "-nostdlib",
        f"-I{libc_include}",
        f"-I{linx_isa_root / 'workloads' / 'benchmarks'}",
        f"-I{project_root / 'benchmarks'}",
        f"-I{upstream}",
        f"-I{port}",
        '-DFLAGS_STR="-O2 (core_list_join:-O0) -ffreestanding -nostdlib"',
        "-DITERATIONS=1",
    ]

    source_files = [
        upstream / "core_list_join.c",
        upstream / "core_main.c",
        upstream / "core_matrix.c",
        upstream / "core_state.c",
        upstream / "core_util.c",
        port / "core_portme.c",
    ]

    objs = _compile_objects(
        clang,
        obj_dir,
        source_files,
        cflags,
        per_source_flags={"core_list_join.c": ["-O0"]},
    )

    elf = build_dir / "coremark.elf"
    link_cmd = [str(lld), "--entry=_start", "-o", str(elf), *[str(o) for o in runtime_objs], *[str(o) for o in objs]]
    p = _run(link_cmd)
    if p.returncode != 0:
        sys.stderr.write(p.stdout)
        sys.stderr.write(p.stderr)
        raise SystemExit("error: coremark link failed")
    return elf


def _build_dhrystone(project_root: Path, clang: Path, lld: Path, linx_isa_root: Path) -> Path:
    bench_root = project_root / "benchmarks" / "dhrystone"
    linx = bench_root / "linx"
    if not linx.exists():
        raise SystemExit("error: dhrystone benchmark sources missing in project")

    build_dir = project_root / "build" / "dhrystone"
    obj_dir = build_dir / "obj"
    runtime_dir = build_dir / "runtime"
    build_dir.mkdir(parents=True, exist_ok=True)

    runtime_objs = _build_runtime(project_root, clang, linx_isa_root, linx_isa_root / "workloads" / "benchmarks", project_root / "benchmarks", runtime_dir)

    libc_include = linx_isa_root / "toolchain" / "libc" / "include"
    cflags = [
        "-target", TARGET,
        "-O2",
        "-ffreestanding",
        "-fno-builtin",
        "-fno-stack-protector",
        "-fno-asynchronous-unwind-tables",
        "-fno-unwind-tables",
        "-fno-exceptions",
        "-fno-jump-tables",
        "-nostdlib",
        f"-I{libc_include}",
        f"-I{linx_isa_root / 'workloads' / 'benchmarks'}",
        f"-I{project_root / 'benchmarks'}",
        f"-I{linx}",
        "-std=gnu89",
        "-Wno-implicit-int",
        "-Wno-return-type",
        "-Wno-implicit-function-declaration",
        "-Wno-deprecated-non-prototype",
        "-DDHRY_RUNS=1000",
    ]

    source_files = [linx / "dhry_1.c", linx / "dhry_2.c"]
    objs = _compile_objects(
        clang,
        obj_dir,
        source_files,
        cflags,
        per_source_flags={
            "dhry_1.c": ["-O0"],
            "dhry_2.c": ["-O0"],
        },
    )

    elf = build_dir / "dhrystone.elf"
    link_cmd = [str(lld), "--entry=_start", "-o", str(elf), *[str(o) for o in runtime_objs], *[str(o) for o in objs]]
    p = _run(link_cmd)
    if p.returncode != 0:
        sys.stderr.write(p.stdout)
        sys.stderr.write(p.stderr)
        raise SystemExit("error: dhrystone link failed")
    return elf


def _emit_binary_and_objdump(objcopy: Path, objdump: Path, elf: Path) -> tuple[Path, Path]:
    bin_path = elf.with_suffix(".bin")
    objdump_path = elf.with_suffix(".objdump.txt")

    copy_cmd = [str(objcopy), "-O", "binary", str(elf), str(bin_path)]
    copy_proc = _run(copy_cmd)
    if copy_proc.returncode != 0:
        sys.stderr.write(copy_proc.stdout)
        sys.stderr.write(copy_proc.stderr)
        raise SystemExit(f"error: failed to emit binary image: {bin_path}")

    disasm_cmd = [str(objdump), "-d", str(elf)]
    disasm_proc = _run(disasm_cmd)
    if disasm_proc.returncode != 0:
        sys.stderr.write(disasm_proc.stdout)
        sys.stderr.write(disasm_proc.stderr)
        raise SystemExit(f"error: failed to emit objdump: {objdump_path}")
    objdump_path.write_text(disasm_proc.stdout, encoding="utf-8")
    return bin_path, objdump_path


def _parse_trace_to_pipeview(trace_text: str) -> list[dict[str, object]]:
    instructions: list[dict[str, object]] = []
    seen: set[tuple[str, str]] = set()
    trace_re = re.compile(r"^\s*0x([0-9a-fA-F]+):")
    objdt_re = re.compile(r"^\s*OBJD-T:\s*(\S+)")
    stage_names = ["Fetch", "Decode", "Execute", "Memory", "Writeback"]
    stage_colors = {
        "Fetch": "#00d9ff",
        "Decode": "#a855f7",
        "Execute": "#00ff88",
        "Memory": "#fbbf24",
        "Writeback": "#ff6b35",
    }

    lines = trace_text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        match = trace_re.match(line)
        if not match:
            i += 1
            continue

        pc_hex = match.group(1).lower()
        obj_chunks: list[str] = []
        j = i + 1
        while j < len(lines):
            next_line = lines[j]
            if trace_re.match(next_line):
                break
            obj_match = objdt_re.match(next_line)
            if obj_match:
                obj_chunks.append(obj_match.group(1))
            j += 1

        if obj_chunks:
            label = f"OBJD-T {obj_chunks[0]}"
            if len(obj_chunks) > 1:
                label += " ..."
        else:
            label = f"PC 0x{pc_hex}"

        key = (pc_hex, label)
        if key in seen:
            i = j
            continue
        seen.add(key)

        idx = len(instructions)
        stages = [
            {
                "name": stage_name,
                "startCycle": idx + stage_index,
                "endCycle": idx + stage_index + 1,
                "color": stage_colors[stage_name],
            }
            for stage_index, stage_name in enumerate(stage_names)
        ]
        instructions.append(
            {
                "id": idx,
                "pc": f"0x{pc_hex}",
                "label": label,
                "stages": stages,
            }
        )
        if len(instructions) >= 200:
            break

        i = j

    return instructions


def _write_pipeview(trace_path: Path, pipeview_path: Path) -> None:
    if not trace_path.exists():
        pipeview_path.write_text(
            json.dumps(
                {"format": "linxcoresight.pipeview.v1", "instructions": []},
                indent=2,
            ),
            encoding="utf-8",
        )
        return

    trace_text = trace_path.read_text(encoding="utf-8", errors="replace")
    instructions = _parse_trace_to_pipeview(trace_text)
    pipeview_path.write_text(
        json.dumps(
            {
                "format": "linxcoresight.pipeview.v1",
                "source": str(trace_path),
                "instructions": instructions,
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def _write_artifact_manifest(
    benchmark: str,
    build_dir: Path,
    elf: Path,
    bin_path: Path,
    objdump_path: Path,
    qemu_log: Path,
    qemu_trace: Path,
    pipeview_path: Path,
) -> None:
    manifest_path = build_dir / "artifacts.json"
    manifest = {
        "benchmark": benchmark,
        "elf": str(elf),
        "bin": str(bin_path),
        "objdump": str(objdump_path),
        "qemuLog": str(qemu_log),
        "qemuTrace": str(qemu_trace),
        "pipeview": str(pipeview_path),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def _run_qemu(qemu: Path, elf: Path, log_path: Path, trace_path: Path, pipeview_path: Path) -> str:
    cmd = [
        str(qemu),
        "-machine",
        "virt",
        "-kernel",
        str(elf),
        "-nographic",
        "-monitor",
        "none",
        "-d",
        "in_asm",
        "-D",
        str(trace_path),
    ]
    print("qemu-cmd:", " ".join(cmd))
    p = _run(cmd, timeout=60.0)
    output = (p.stdout or "") + (p.stderr or "")
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text(output, encoding="utf-8")
    _write_pipeview(trace_path, pipeview_path)
    print(f"pipeview: {pipeview_path}")
    if p.returncode != 0:
        raise SystemExit(f"error: qemu failed with exit={p.returncode}; see {log_path}")
    return output


def _validate(benchmark: str, text: str) -> None:
    if "Correct operation validated." not in text:
        raise SystemExit("error: benchmark validation failed: expected 'Correct operation validated.'")
    if benchmark == "coremark":
        if "Errors detected" in text or "ERROR!" in text:
            raise SystemExit("error: coremark validation failed due to error markers")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Build/run LinxCoreSight benchmark demos.")
    parser.add_argument("--benchmark", required=True, choices=["coremark", "dhrystone", "drystone"])
    parser.add_argument("--action", required=True, choices=["build", "run", "all"])
    parser.add_argument("--project-root", default=None)
    args = parser.parse_args(argv)

    benchmark = "dhrystone" if args.benchmark == "drystone" else args.benchmark
    project_root = _project_root(Path(__file__), args.project_root)

    home = Path.home()
    clang, lld, objcopy, objdump, qemu, linx_isa_root = _tool_paths(home)
    _check_exec(clang, "clang")
    _check_exec(lld, "ld.lld")
    _check_exec(objcopy, "llvm-objcopy")
    _check_exec(objdump, "llvm-objdump")
    _check_exec(qemu, "qemu-system-linx64")
    if not linx_isa_root.exists():
        raise SystemExit("error: linx-isa root not found; set LINX_ISA_ROOT")

    if benchmark == "coremark":
        build_dir = project_root / "build" / "coremark"
        elf = build_dir / "coremark.elf"
        bin_path = build_dir / "coremark.bin"
        objdump_path = build_dir / "coremark.objdump.txt"
        qemu_log = build_dir / "qemu.log"
        qemu_trace = build_dir / "qemu.in_asm.log"
        pipeview_path = build_dir / "pipeview.json"

        if args.action in ("build", "all"):
            elf = _build_coremark(project_root, clang, lld, linx_isa_root)
            bin_path, objdump_path = _emit_binary_and_objdump(objcopy, objdump, elf)
            _write_artifact_manifest("coremark", build_dir, elf, bin_path, objdump_path, qemu_log, qemu_trace, pipeview_path)
            print(f"ok: built {elf}")
        if args.action in ("run", "all"):
            if not elf.exists():
                elf = _build_coremark(project_root, clang, lld, linx_isa_root)
                bin_path, objdump_path = _emit_binary_and_objdump(objcopy, objdump, elf)
            elif not bin_path.exists() or not objdump_path.exists():
                bin_path, objdump_path = _emit_binary_and_objdump(objcopy, objdump, elf)
            output = _run_qemu(qemu, elf, qemu_log, qemu_trace, pipeview_path)
            _write_artifact_manifest("coremark", build_dir, elf, bin_path, objdump_path, qemu_log, qemu_trace, pipeview_path)
            _validate("coremark", output)
            print("ok: coremark run validated")

    if benchmark == "dhrystone":
        build_dir = project_root / "build" / "dhrystone"
        elf = build_dir / "dhrystone.elf"
        bin_path = build_dir / "dhrystone.bin"
        objdump_path = build_dir / "dhrystone.objdump.txt"
        qemu_log = build_dir / "qemu.log"
        qemu_trace = build_dir / "qemu.in_asm.log"
        pipeview_path = build_dir / "pipeview.json"

        if args.action in ("build", "all"):
            elf = _build_dhrystone(project_root, clang, lld, linx_isa_root)
            bin_path, objdump_path = _emit_binary_and_objdump(objcopy, objdump, elf)
            _write_artifact_manifest("dhrystone", build_dir, elf, bin_path, objdump_path, qemu_log, qemu_trace, pipeview_path)
            print(f"ok: built {elf}")
        if args.action in ("run", "all"):
            if not elf.exists():
                elf = _build_dhrystone(project_root, clang, lld, linx_isa_root)
                bin_path, objdump_path = _emit_binary_and_objdump(objcopy, objdump, elf)
            elif not bin_path.exists() or not objdump_path.exists():
                bin_path, objdump_path = _emit_binary_and_objdump(objcopy, objdump, elf)
            output = _run_qemu(qemu, elf, qemu_log, qemu_trace, pipeview_path)
            _write_artifact_manifest("dhrystone", build_dir, elf, bin_path, objdump_path, qemu_log, qemu_trace, pipeview_path)
            _validate("dhrystone", output)
            print("ok: dhrystone run validated")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
