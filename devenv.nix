{
  pkgs,
  config,
  lib,
  inputs,
  ...
}:
let
  ic-nix-release = "20260203";

  ic-nix =
    import
      (fetchTarball {
        url = "https://github.com/ninegua/ic-nix/archive/refs/tags/${ic-nix-release}.tar.gz";
        sha256 = "0vydcs3m46rwm3z6d4mqvxsa8s26rl5qw3apy5lpvg8146h2y54g";
      })
      {
        pkgs = pkgs.appendOverlays [
          (_self: _super: {
            rust-stable = config.languages.rust.toolchainPackage;
          })
        ];
      };

  ic-nix-packages = with ic-nix; [
    # SDK
    dfx
    # Utils
    icx-proxy
    idl2json
    vessel
    ic-repl
    ic-wasm
    candid
    candid-extractor
    agent-rs
    dfx-extensions
    # IC
    #binaries
    #wasm-binaries
    #canisters
  ];

  pkgsUnstable = import inputs.nixpkgs-unstable {
    config.allowUnfree = true;
  };

  #packages = with pkgs; [ ];

  packagesUnstable = with pkgsUnstable; [
    tailwindcss_4
    gemini-cli-bin
    #claude-code-bin
    claude-code
  ];

  devPackages =
    with pkgs;
    [
      # AI Agents
      #gemini-cli-bin
      #claude-code-bin

      # pickle-rick dependencies
      python3

      # General
      bash
      bc
      coreutils
      figlet
      gcc
      git
      git
      hello
      jq
      multitail
      openssl
      ripgrep
      yq-go

      # Devenv
      direnv
      secretspec

      # Astro
      astro-language-server
      nodePackages.postcss
      #tailwindcss_4
      npm-check-updates

      # Nix
      nixd
      nil
      nixfmt

      # Rust
      cargo-bump
      cargo-watch
      toml-cli

      # Security
      trivy

      # Solidity.
      solc-select
      slither-analyzer

      # Audio
      ffmpeg
      # Image processing for Sharp
      vips
    ]
    ++ ic-nix-packages;

in
{
  name = "tresr-game";

  env = {
    #########################
    # General
    #########################
    PROJECT = config.name;
    # Fix for Sharp image processing library
    LD_LIBRARY_PATH = "${lib.makeLibraryPath [ pkgs.stdenv.cc.cc.lib ]}";
  }
  // (lib.optionalAttrs (config.secretspec.secrets ? DAISYUI_LICENSE) {
    inherit (config.secretspec.secrets) DAISYUI_LICENSE;
  })
  // (lib.optionalAttrs (config.secretspec.secrets ? DAISYUI_EMAIL) {
    inherit (config.secretspec.secrets) DAISYUI_EMAIL;
  })
  // (lib.optionalAttrs (config.secretspec.secrets ? DEPLOYER_PRIVATE_KEY) {
    inherit (config.secretspec.secrets) DEPLOYER_PRIVATE_KEY;
  })
  // (lib.optionalAttrs (config.secretspec.secrets ? SNOWTRACE_API_KEY) {
    inherit (config.secretspec.secrets) SNOWTRACE_API_KEY;
  })
  // (lib.optionalAttrs (config.secretspec.secrets ? PUBLIC_WALLETCONNECT_PROJECT_ID) {
    inherit (config.secretspec.secrets) PUBLIC_WALLETCONNECT_PROJECT_ID;
  });

  cachix = {
    pull = [
      "pre-commit-hooks"
      "tresr-community"
    ];
    push = "tresr-community";
  };

  devenv = {
    warnOnNewVersion = true;
  };

  dotenv = {
    enable = true;
    disableHint = false;
  };

  packages =
    packagesUnstable
    ++ lib.optionals (!config.container.isBuilding || config.name == "devenv") devPackages;

  enterShell = ''
    if [[ "''${CI:-false}" == "true" ]];
    then
      echo "devenv running in CI"
    else
      figlet -f starwars -w 180 $PROJECT

      hello --greeting="Hello ''${USER:-user}, welcome to the $PROJECT project!"

      echo ""
      echo "#########################"
      echo "#### Helper scripts #####"
      echo "#########################"
      echo "🦾"
      ${lib.concatStrings (
        lib.mapAttrsToList (
          name: value: "printf '🦾 %-20s  %s\\n' '${name}' '${value.description}'\n"
        ) config.scripts
      )}
      echo "🦾"
      echo "#########################"
    fi
  '';

  # AI - Claude Code Integration
  # See: https://devenv.sh/integrations/claude-code/
  claude.code = {
    enable = true;
    mcpServers = {
      devenv = {
        type = "stdio";
        command = "devenv";
        args = [ "mcp" ];
        env = {
          DEVENV_ROOT = config.devenv.root;
        };
      };
      astroDocs = {
        type = "http";
        url = "https://mcp.docs.astro.build/mcp";
      };
      github = {
        type = "http";
        url = "https://api.githubcopilot.com/mcp/";
        headers = {
          Authorization = lib.optionalString (config.env ? GITHUB_TOKEN) "Bearer ${config.env.GITHUB_TOKEN}";
        };
      };
      daisyui-blueprint = {
        type = "stdio";
        command = "bunx";
        args = [
          "-y"
          "daisyui-blueprint@latest"
        ];
        env =
          lib.optionalAttrs (config.env ? DAISYUI_LICENSE) { LICENSE = config.env.DAISYUI_LICENSE; }
          // lib.optionalAttrs (config.env ? DAISYUI_EMAIL) { EMAIL = config.env.DAISYUI_EMAIL; };
      };
    };
  };

  languages = {
    nix = {
      enable = true;
    };
    shell = {
      enable = true;
    };
    javascript = {
      enable = true;
      bun = {
        enable = true;
      };
      npm = {
        enable = true;
      };
    };
    rust = {
      enable = true;
      channel = "stable";
      components = [
        "rustc"
        "cargo"
        "clippy"
        "rustfmt"
        "rust-analyzer"
      ];
      #rustflags = "--cfg getrandom_backend=\"wasm_js\"";
      targets = [ "wasm32-unknown-unknown" ];
    };
    solidity = {
      enable = true;
      foundry = {
        enable = true;
      };
    };
  };

  difftastic = {
    enable = true;
  };

  git-hooks = {
    excludes = [
      ".direnv/"
      ".dist/"
      ".git/"
      ".vscode/"
      "^docs/agents/.*"
      "^contracts/" # Using custom pre-commit hook.
    ];
    hooks = {
      actionlint.enable = true;
      action-validator.enable = true;
      convco = {
        enable = true;
        settings = {
          configPath = ".versionrc";
        };
      };
      cargo-check.enable = true;
      clippy = {
        enable = false; # TODO: Re-enable when ic-nix is v1.9.2
        settings = {
          denyWarnings = true;
          offline = true;
          allFeatures = true;
          #extraArgs = "--target wasm32-unknown-unknown";
        };
      };
      check-json.enable = true;
      check-merge-conflicts.enable = true;
      check-shebang-scripts-are-executable = {
        enable = true;
        excludes = [
          "\\.rs$"
        ];
      };
      check-symlinks.enable = true;
      check-yaml.enable = true;
      astro-check = {
        enable = true;
        name = "astro-check";
        entry = "bun run astro check";
        files = "^src/.*\\.(astro|ts|tsx)$";
        pass_filenames = false;
      };
      client-config = {
        enable = true;
        name = "client-config";
        entry = "bun run client-config";
        files = "^config/.*\.yaml$";
        pass_filenames = false;
      };
      version-reset = {
        enable = true;
        name = "version-reset";
        entry = "bun run version-reset";
        files = "(^package\\.json$|^public/manifest\\.json$|^src/satellite/Cargo\\.toml$)";
        pass_filenames = false;
      };
      commitizen.enable = true;
      deadnix.enable = true;
      editorconfig-checker.enable = true;
      eslint.enable = false;
      eslint-hack = {
        enable = true;
        name = "eslint-hack";
        entry = "eslint-check";
        files = "^src/.*$";
        pass_filenames = false;
      };
      markdownlint = {
        excludes = [
          "^docs/todo/.*\\.md$" # Ignore todo notes.
        ];
        enable = true;
        settings = {
          configuration = {
            MD013 = {
              line_length = 200;
              tables = false;
              code_blocks = false;
            };
            MD033 = {
              allowed_elements = [
                "a"
                "br"
                "nobr"
                "pre"
                "sup"
              ];
            };
          };
        };
      };
      mixed-line-endings.enable = true;
      nixfmt.enable = true;
      prettier = {
        enable = true;
        settings = {
          configPath = ".prettierrc.yaml";
        };
      };
      pretty-format-json = {
        enable = false;
      };
      revive = {
        enable = true;
        fail_fast = false;
      };
      ripsecrets = {
        enable = true;
      };
      shellcheck = {
        enable = true;
      };
      shfmt.enable = true;
      staticcheck.enable = true;
      statix.enable = true;
      trim-trailing-whitespace.enable = true;
      trufflehog.enable = true;
      cspell = {
        enable = true;
        excludes = [
          "\\.webp$"
          "\\.png$"
          "\\.jpg$"
          "\\.jpeg$"
          "\\.gif$"
          "\\.ico$"
          "\\.svg$"
          "\\.woff2?$"
          "\\.ttf$"
          "\\.eot$"
          "\\.mp3$"
          "\\.mp4$"
          "\\.ogg$"
          "\\.wav$"
          "\\.wasm$"
        ];
      };
      yamllint = {
        enable = true;
        settings = {
          configuration = ''
            extends: relaxed
            rules:
              line-length: disable
              indentation: enable
          '';
        };
      };
      solidity-check = {
        enable = true;
        name = "solidity-check";
        entry = "solidity-dev check";
        pass_filenames = false;
      };
    };
  };

  starship = {
    enable = true;
    config = {
      enable = false;
    };
  };

  devcontainer = {
    enable = true;
    settings = {
      containerEnv = {
        NIX_REMOTE = "daemon";
      };
      mounts = [
        # Mount Nix store the host to the container.
        "source=/nix,target=/nix,readonly,type=bind"
      ];
      customizations = {
        vscode = {
          extensions = [
            "arrterian.nix-env-selector"
            "astro-build.astro-vscode"
            "esbenp.prettier-vscode"
            "github.vscode-github-actions"
            "gruntfuggly.todo-tree"
            "johnpapa.vscode-peacock"
            "mkhl.direnv"
            "nhoizey.gremlins"
            "pinage404.nix-extension-pack"
            "redhat.vscode-yaml"
            "streetsidesoftware.code-spell-checker"
            "timonwong.shellcheck"
            "tuxtina.json2yaml"
            "vscodevim.vim"
            "wakatime.vscode-wakatime"
            "yzhang.markdown-all-in-one"
          ];
        };
      };
    };
  };

  scripts = {
    eslint-check = {
      package = pkgs.bash;
      description = "A workaround to use a more modern version of ESLint.";
      exec = ''
        bun install
        eslint src/
      '';
    };
    juno = {
      package = pkgs.bash;
      description = "Wrapper for Juno CLI (runs via bun)";
      exec = ''
        # Ensure node_modules exists and juno is installed
        if [[ ! -d "node_modules/@junobuild/cli" ]]; then
          echo "Juno CLI not found. Installing dependencies..."
          bun install
        fi
        bun x juno "$@"
      '';
    };
    juno-dev = {
      package = pkgs.bash;
      description = "Start/Stop development environment (Astro + Juno emulator).";
      exec = ''
        ./scripts/juno-dev.sh "$@"
      '';
    };
    solidity-dev = {
      package = pkgs.bash;
      description = "Check Solidity code for errors.";
      exec = ''
        ./scripts/solidity-dev.sh "$@"
      '';
    };
  };

  enterTest = ''
    echo "Running devenv tests..."
  '';
}
