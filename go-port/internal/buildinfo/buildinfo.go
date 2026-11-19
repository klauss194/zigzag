package buildinfo

var Version = "dev"

var Flavor = "full"

func IsRelease() bool { return Version != "" && Version != "dev" }
